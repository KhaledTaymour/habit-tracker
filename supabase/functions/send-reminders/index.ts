// Sends the reminders that are due this minute. Called by pg_cron every minute
// (DESIGN.md §10.5), and by the app with {test:true} to prove the chain works.
//
// All the "who is due" thinking is in SQL (habits_due_now). This file only
// encrypts and delivers.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

interface DueRow {
  habit_id: string
  user_id: string
  name: string
  emoji: string
  pending: number
  endpoint: string
  p256dh: string
  auth: string
}

const env = (key: string): string => {
  const value = Deno.env.get(key)
  if (!value) throw new Error(`Missing secret: ${key}`)
  return value
}

// The browser sends Authorization + Content-Type, which makes it fire an OPTIONS
// preflight before the POST. Without an answer to that, the real request never
// leaves the browser — and curl never shows the problem, because curl doesn't
// preflight.
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: CORS })

webpush.setVapidDetails(
  env('VAPID_SUBJECT'), // e.g. mailto:you@example.com
  env('VAPID_PUBLIC_KEY'),
  env('VAPID_PRIVATE_KEY'),
)

// Service role: this function must read every user's due habits, which no
// user-scoped token can do. It is never exposed to the browser.
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))

// badge null means 'leave the icon badge alone' — used by the test push, which
// must not wipe a real pending count.
async function deliver(
  row: DueRow,
  title: string,
  body: string,
  badge: number | null,
): Promise<'sent' | 'gone' | 'failed'> {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify({ title, body, badge, url: '/' }),
      { TTL: 60 * 30 }, // a reminder is worthless an hour late
    )
    return 'sent'
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode
    // 404/410 mean the app was uninstalled or the endpoint rotated. These never
    // recover — leaving them makes every future run slower and noisier.
    if (status === 404 || status === 410) {
      await db.from('push_subscriptions').delete().eq('endpoint', row.endpoint)
      return 'gone'
    }
    console.error('push failed', status, (error as Error).message)
    return 'failed'
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let isTest = false
  let isDiagnose = false
  try {
    const body = await req.json()
    isTest = body?.test === true
    isDiagnose = body?.diagnose === true
  } catch {
    // pg_cron posts '{}'; a missing body is normal.
  }

  // Who is asking? Both the test and diagnose paths are caller-scoped.
  const callerId = async (): Promise<string | null> => {
    const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
    const { data } = await createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
      global: { headers: { Authorization: `Bearer ${token}` } },
    }).auth.getUser()
    return data.user?.id ?? null
  }

  // --- diagnose path: why did or didn't a reminder fire? Read-only. ---
  if (isDiagnose) {
    const userId = await callerId()
    if (!userId) return json({ error: 'not signed in' }, 401)
    const { data, error: diagError } = await db.rpc('reminder_diagnostics', { p_user: userId })
    if (diagError) return json({ error: diagError.message }, 500)
    return json(data)
  }

  // --- test path: prove delivery for the caller only ---
  if (isTest) {
    const userId = await callerId()
    if (!userId) return json({ error: 'not signed in' }, 401)

    const { data: subs } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)

    if (!subs?.length) return json({ error: 'no devices subscribed' }, 400)

    const results = await Promise.all(
      subs.map((s) =>
        deliver(
          { ...s, habit_id: '', user_id: userId, name: '', emoji: '', pending: 0 } as DueRow,
          'Habit Tracker',
          'Test push — reminders are working.',
          null,
        ),
      ),
    )
    return json({ test: true, devices: results.length, results })
  }

  // --- normal path: whoever is due this minute ---
  const { data: due, error } = await db.rpc('habits_due_now')
  if (error) return json({ error: error.message }, 500)

  const rows = (due ?? []) as DueRow[]
  if (rows.length === 0) return json({ sent: 0 })

  const results = await Promise.all(
    rows.map((row) =>
      deliver(row, `${row.emoji} ${row.name}`, timeToActWord(row.pending), row.pending),
    ),
  )

  // Group outcomes per habit: rows are (habit x device) pairs.
  const outcomes = new Map<string, Array<'sent' | 'gone' | 'failed'>>()
  rows.forEach((row, i) => {
    const list = outcomes.get(row.habit_id) ?? []
    const result = results[i]
    if (result) list.push(result)
    outcomes.set(row.habit_id, list)
  })

  // Only mark a habit done-for-today if at least one device was actually reached.
  // 'gone' counts as reached — the endpoint is permanently dead, so retrying every
  // minute helps nobody. 'failed' is transient, and marking it would burn the whole
  // day on one bad send: the habit would be locked out until tomorrow with no
  // reminder ever shown.
  const reached: string[] = []
  const retrying: string[] = []
  for (const [habitId, list] of outcomes) {
    if (list.some((r) => r !== 'failed')) reached.push(habitId)
    else retrying.push(habitId)
  }

  if (reached.length > 0) {
    const { error: markError } = await db.rpc('mark_notified', { ids: reached })
    if (markError) console.error('mark_notified failed', markError.message)
  }

  return json({
    sent: results.filter((r) => r === 'sent').length,
    gone: results.filter((r) => r === 'gone').length,
    failed: results.filter((r) => r === 'failed').length,
    habits: reached.length,
    // Named in the response so a stuck habit is visible, not inferred.
    retrying: retrying.length,
  })
})

function timeToActWord(pending: number): string {
  if (pending <= 1) return 'Time to do it.'
  return `Time to do it — ${pending} left today.`
}
