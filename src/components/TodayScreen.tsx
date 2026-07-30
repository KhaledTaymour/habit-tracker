import { useEffect, useState } from 'react'
import { signOut } from '@/lib/supabase'
import {
  dueToday,
  isDoneToday,
  pendingCount,
  streakFor,
  useHabits,
} from '@/stores/habits'
import type { Habit, HabitDraft } from '@/types'
import { ActivityGrid } from './ActivityGrid'
import { HabitCard } from './HabitCard'
import { HabitForm } from './HabitForm'
import { NotificationSetup } from './NotificationSetup'

type Editing = { mode: 'new' } | { mode: 'edit'; habit: Habit } | null

export function TodayScreen() {
  const { habits, completions, loading, error, load, add, update, remove, toggleToday } =
    useHabits()
  const [editing, setEditing] = useState<Editing>(null)

  useEffect(() => {
    void load()
  }, [load])

  const today = dueToday(habits)
  const pending = pendingCount(habits, completions)
  const later = habits.filter((h) => !today.includes(h))

  async function save(draft: HabitDraft) {
    if (editing?.mode === 'edit') await update(editing.habit.id, draft)
    else await add(draft)
    setEditing(null)
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[70rem] flex-col gap-[clamp(1rem,3cqi,1.75rem)] p-[clamp(1rem,4cqi,2rem)]">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h1 className="text-[clamp(1.5rem,1.25rem+2cqi,2.25rem)] font-semibold tracking-tight">
            Today
          </h1>
          <p className="text-sm text-slate-400">
            {loading
              ? 'Loading…'
              : pending === 0
                ? today.length === 0
                  ? 'Nothing scheduled today.'
                  : 'All done. 🎉'
                : `${pending} of ${today.length} left`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void signOut()}
          className="text-xs text-slate-500 underline underline-offset-2 [@media(hover:hover)]:hover:text-slate-300"
        >
          Sign out
        </button>
      </header>

      <NotificationSetup />

      {error && (
        <p className="rounded-xl border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* The whole responsive story: as many ~18rem columns as fit. One on a
          phone, three on a desktop, and no breakpoint was written. */}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-3">
        {today.map((habit) => (
          <HabitCard
            key={habit.id}
            habit={habit}
            done={isDoneToday(completions, habit.id)}
            streak={streakFor(habit, completions)}
            onToggle={() => void toggleToday(habit.id)}
            onEdit={() => setEditing({ mode: 'edit', habit })}
          />
        ))}
      </section>

      {!loading && habits.length === 0 && (
        <p className="text-balance py-8 text-center text-slate-500">
          No habits yet. Add the first one — start with something small enough that you
          cannot talk yourself out of it.
        </p>
      )}

      {later.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Not scheduled today
          </h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-3 opacity-60">
            {later.map((habit) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                done={isDoneToday(completions, habit.id)}
                streak={streakFor(habit, completions)}
                onToggle={() => void toggleToday(habit.id)}
                onEdit={() => setEditing({ mode: 'edit', habit })}
              />
            ))}
          </div>
        </section>
      )}

      {habits.length > 0 && <ActivityGrid habits={habits} completions={completions} />}

      <button
        type="button"
        onClick={() => setEditing({ mode: 'new' })}
        className="mt-auto rounded-full bg-accent px-6 py-3 font-semibold text-white transition-transform motion-safe:active:scale-[0.98] [@media(pointer:coarse)]:py-4"
      >
        + Add habit
      </button>

      {editing && (
        <HabitForm
          habit={editing.mode === 'edit' ? editing.habit : undefined}
          onSave={(draft) => void save(draft)}
          onDelete={
            editing.mode === 'edit'
              ? () => {
                  void remove(editing.habit.id)
                  setEditing(null)
                }
              : undefined
          }
          onClose={() => setEditing(null)}
        />
      )}
    </main>
  )
}
