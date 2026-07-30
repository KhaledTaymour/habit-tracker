import { supabase } from './supabase'

/** The states from DESIGN.md §10.4. 'needs-install' is the iOS trap: nothing is
 *  broken, but nothing will ever be delivered from a Safari tab. */
export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'can-ask'
  | 'blocked'
  | 'ready'
  /** Permission is granted but the endpoint could not be stored, so nothing will
   *  arrive. Its own state because it is the one failure that otherwise looks
   *  identical to success. */
  | 'error'

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  const ua = window.navigator.userAgent
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ claims to be a Mac; touch points give it away.
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
  )
}

/** The checks that need no network. Never returns 'ready' — granted permission is
 *  not the same as "will receive", and conflating the two is how you ship silence. */
function localState(): PushState | 'granted' {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  // Safari exposes PushManager in tabs but never delivers; installing is the fix.
  if (isIos() && !isStandalone()) return 'needs-install'
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission === 'granted') return 'granted'
  return 'can-ask'
}

/**
 * 'ready' means one thing only: this device's endpoint is in the database, so the
 * server has somewhere to deliver to.
 *
 * When permission is already granted but the endpoint is missing, this repairs it
 * rather than reporting a state the user cannot act on. Browsers drop push
 * subscriptions on their own, so the repair is not just for first run.
 */
export async function pushState(): Promise<PushState> {
  const local = localState()
  if (local !== 'granted') return local
  try {
    return await subscribeAndSave()
  } catch {
    return 'error'
  }
}

/** The VAPID key ships as URL-safe base64; subscribe() wants raw bytes.
 *  Built with the constructor, not Uint8Array.from, because only the constructor
 *  yields Uint8Array<ArrayBuffer> — what BufferSource requires. */
function vapidKey(): Uint8Array<ArrayBuffer> {
  const base64 = import.meta.env.VITE_VAPID_PUBLIC_KEY
  if (!base64) throw new Error('Missing VITE_VAPID_PUBLIC_KEY — see .env.example')
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const raw = atob(padded)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/**
 * Subscribe this device and store its endpoint. Assumes permission is already
 * granted. Idempotent — safe to call on every load, which is what makes a dropped
 * subscription self-repairing.
 */
async function subscribeAndSave(): Promise<'ready'> {
  const registration = await navigator.serviceWorker.ready
  const existing = await registration.pushManager.getSubscription()
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: vapidKey(),
    }))

  const json = subscription.toJSON()
  const { data: user } = await supabase.auth.getUser()
  if (!user.user) throw new Error('Not signed in')

  // Upsert on endpoint: re-running this must not pile up duplicate rows.
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.user.id,
      endpoint: subscription.endpoint,
      p256dh: json.keys?.p256dh ?? '',
      auth: json.keys?.auth ?? '',
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error

  return 'ready'
}

/**
 * Ask for permission, then subscribe and store.
 * Must be called from a real user gesture — browsers ignore permission requests
 * that aren't.
 */
export async function enablePush(): Promise<PushState> {
  const local = localState()
  if (local === 'unsupported' || local === 'needs-install' || local === 'blocked') return local

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'can-ask'

  return subscribeAndSave()
}

export interface TestResult {
  devices: number
  sent: number
  failed: number
  gone: number
}

/** Proves the whole chain works end to end. Without this, 'ready' and 'silently
 *  broken' look identical to the user.
 *
 *  Returns what actually happened per device. Reporting "sent" without reading the
 *  result would make this button a third way to claim success we never checked. */
export async function sendTestPush(): Promise<TestResult> {
  const { data, error } = await supabase.functions.invoke<{
    devices?: number
    results?: Array<'sent' | 'gone' | 'failed'>
  }>('send-reminders', { body: { test: true } })
  if (error) throw error

  const results = data?.results ?? []
  const count = (want: string) => results.filter((r) => r === want).length
  return {
    devices: data?.devices ?? results.length,
    sent: count('sent'),
    failed: count('failed'),
    gone: count('gone'),
  }
}
