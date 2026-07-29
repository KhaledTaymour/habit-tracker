import { supabase } from './supabase'

/** The states from DESIGN.md §10.4. 'needs-install' is the iOS trap: nothing is
 *  broken, but nothing will ever be delivered from a Safari tab. */
export type PushState =
  | 'unsupported'
  | 'needs-install'
  | 'can-ask'
  | 'blocked'
  | 'ready'

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

export function pushState(): PushState {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  // Safari exposes PushManager in tabs but never delivers; installing is the fix.
  if (isIos() && !isStandalone()) return 'needs-install'
  if (Notification.permission === 'denied') return 'blocked'
  if (Notification.permission === 'granted') return 'ready'
  return 'can-ask'
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
 * Ask for permission, subscribe this device, store the endpoint.
 * Must be called from a real user gesture — browsers ignore permission
 * requests that aren't.
 */
export async function enablePush(): Promise<PushState> {
  const state = pushState()
  if (state === 'unsupported' || state === 'needs-install' || state === 'blocked') return state

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'can-ask'

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

  // Upsert on endpoint: re-enabling on the same device must not pile up rows.
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

/** Proves the whole chain works end to end. Without this, 'ready' and 'silently
 *  broken' look identical to the user. */
export async function sendTestPush(): Promise<void> {
  const { error } = await supabase.functions.invoke('send-reminders', {
    body: { test: true },
  })
  if (error) throw error
}
