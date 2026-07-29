import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { SignIn } from '@/components/SignIn'
import { TodayScreen } from '@/components/TodayScreen'

/** DESIGN.md §10.6. 'checking' is its own state on purpose: rendering the sign-in
 *  screen while a stored session is still being read makes the app flash a login
 *  page at someone who is already signed in. */
type SessionState =
  | { status: 'checking' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; session: Session }

export default function App() {
  const [state, setState] = useState<SessionState>({ status: 'checking' })

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) =>
      setState(data.session ? { status: 'signed-in', session: data.session } : { status: 'signed-out' }),
    )

    // Covers sign-in, sign-out, token refresh, and returning from Google's redirect.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) =>
      setState(session ? { status: 'signed-in', session } : { status: 'signed-out' }),
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  if (state.status === 'checking') {
    return (
      <div className="grid min-h-dvh place-items-center text-slate-500" aria-busy="true">
        <span className="animate-pulse text-3xl" aria-hidden="true">
          🎯
        </span>
        <span className="sr-only">Loading</span>
      </div>
    )
  }

  return state.status === 'signed-in' ? <TodayScreen /> : <SignIn />
}
