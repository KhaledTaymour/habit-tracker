import { signInWithGoogle } from '@/lib/supabase'

export function SignIn() {
  return (
    <main className="grid min-h-dvh place-items-center p-[clamp(1rem,4cqi,2rem)]">
      <div className="flex w-full max-w-[26rem] flex-col items-center gap-[clamp(1rem,3cqi,1.75rem)] text-center">
        <span className="text-[clamp(3rem,2rem+8cqi,5rem)] leading-none">🎯</span>

        <h1 className="text-[clamp(1.5rem,1rem+3cqi,2.25rem)] font-semibold tracking-tight">
          Habit Tracker
        </h1>
        <p className="text-balance text-[clamp(0.875rem,0.8rem+0.5cqi,1rem)] text-slate-400">
          Add a habit. Get reminded. Keep the streak.
        </p>

        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          className="flex w-full items-center justify-center gap-3 rounded-full bg-white px-6 py-3 font-medium text-slate-900 transition-transform [@media(hover:hover)]:hover:bg-slate-100 motion-safe:active:scale-[0.98] [@media(pointer:coarse)]:py-4"
        >
          <GoogleMark />
          Continue with Google
        </button>
      </div>
    </main>
  )
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5 shrink-0">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 13.7 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v8.3h12.5c-.3 2.1-1.6 5.2-4.7 7.3l7.6 5.9c4.5-4.2 6.7-10.3 6.7-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.2A14.5 14.5 0 0 1 9.6 24c0-1.5.3-2.9.7-4.2l-7.8-6.1A23.6 23.6 0 0 0 .5 24c0 3.8.9 7.4 2.1 10.3l7.8-6.1z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.4-2 15.4-5.6l-7.6-5.9c-2 1.4-4.7 2.4-7.8 2.4-6.4 0-11.7-4.2-13.6-10l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5z" />
    </svg>
  )
}
