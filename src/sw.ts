/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)

self.addEventListener('install', () => {
  void self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

interface ReminderPayload {
  title: string
  body: string
  /** Habits still pending today. Absent or null means "leave the badge alone" —
   *  a test push must not wipe a real count. */
  badge?: number | null
  url?: string
}

self.addEventListener('push', (event) => {
  // A push with an unreadable body still has to show something: the browser
  // revokes push permission from workers that receive a push and show nothing.
  let payload: ReminderPayload = { title: 'Habit Tracker', body: 'Time for a habit.' }
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as ReminderPayload) }
  } catch {
    // keep the fallback
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: '/icons/pwa-192x192.png',
        badge: '/icons/pwa-192x192.png',
        // Collapses repeat reminders for the same habit instead of stacking them.
        tag: payload.url ?? 'habit-reminder',
        renotify: true,
        data: { url: payload.url ?? '/' },
      } as NotificationOptions)

      const badger = navigator as Navigator & {
        setAppBadge?: (n?: number) => Promise<void>
        clearAppBadge?: () => Promise<void>
      }
      try {
        if (typeof payload.badge === 'number') {
          if (payload.badge > 0) await badger.setAppBadge?.(payload.badge)
          else await badger.clearAppBadge?.()
        }
      } catch {
        // Badging unsupported here; the notification already landed.
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data as { url?: string } | null)?.url ?? '/'

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = clients.find((c) => 'focus' in c)
      if (open) {
        await open.focus()
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})
