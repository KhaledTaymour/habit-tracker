import { useState } from 'react'
import { enablePush, isIos, pushState, sendTestPush, type PushState } from '@/lib/push'

/**
 * Makes the state from DESIGN.md §10.4 visible. The 'needs-install' and 'blocked'
 * states look identical to working from the inside — silence — so the app has to
 * say which one you're in, and offer a test push to prove it.
 */
export function NotificationSetup() {
  const [state, setState] = useState<PushState>(pushState)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function turnOn() {
    setBusy(true)
    setMessage(null)
    try {
      setState(await enablePush())
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function test() {
    setBusy(true)
    setMessage(null)
    try {
      await sendTestPush()
      setMessage('Sent. If nothing arrives within a few seconds, reminders are not working.')
    } catch (error) {
      setMessage((error as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'ready') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        <span>Reminders on.</span>
        <button
          type="button"
          onClick={() => void test()}
          disabled={busy}
          className="underline underline-offset-2 disabled:opacity-50 [@media(hover:hover)]:hover:text-slate-300"
        >
          Send a test
        </button>
        {message && <span className="basis-full text-slate-400">{message}</span>}
      </div>
    )
  }

  return (
    <aside className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-[clamp(0.875rem,0.5rem+2cqi,1.25rem)] text-sm">
      {state === 'needs-install' && (
        <>
          <p className="font-semibold text-amber-200">Install first, then reminders work</p>
          <p className="mt-1 text-amber-100/80">
            {isIos()
              ? 'On iPhone, tap Share, then "Add to Home Screen", and open the app from there. Safari tabs cannot receive reminders.'
              : 'Install the app from your browser menu, then reopen it to turn on reminders.'}
          </p>
        </>
      )}

      {state === 'can-ask' && (
        <>
          <p className="font-semibold text-amber-200">Reminders are off</p>
          <p className="mt-1 text-amber-100/80">
            Without them this is just a list. You will get one notification per habit, at
            the time you choose.
          </p>
          <button
            type="button"
            onClick={() => void turnOn()}
            disabled={busy}
            className="mt-3 rounded-full bg-amber-400 px-5 py-2.5 font-semibold text-amber-950 disabled:opacity-50 [@media(pointer:coarse)]:py-3"
          >
            {busy ? 'Turning on…' : 'Turn on reminders'}
          </button>
        </>
      )}

      {state === 'blocked' && (
        <>
          <p className="font-semibold text-amber-200">Notifications are blocked</p>
          <p className="mt-1 text-amber-100/80">
            The browser is refusing, so we cannot ask again from here. Allow notifications
            for this site in your browser or OS settings, then reload.
          </p>
        </>
      )}

      {state === 'unsupported' && (
        <>
          <p className="font-semibold text-amber-200">This browser cannot receive reminders</p>
          <p className="mt-1 text-amber-100/80">
            Habits and streaks still work. For reminders, use Chrome, Edge, Firefox, or an
            installed app on iOS 16.4 or newer.
          </p>
        </>
      )}

      {message && <p className="mt-2 text-xs text-amber-100/70">{message}</p>}
    </aside>
  )
}
