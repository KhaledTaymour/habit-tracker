import type { Habit } from '@/types'

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

function scheduleWords(habit: Habit): string {
  if (habit.schedule_type === 'daily') return 'every day'
  const days = [...habit.days_of_week].sort((a, b) => a - b)
  if (habit.schedule_type === 'weekly') {
    const full = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
    return full[days[0] ?? 0] ?? 'weekly'
  }
  const isWeekdays = days.length === 5 && days.every((d) => d >= 1 && d <= 5)
  if (isWeekdays) return 'Mon–Fri'
  return days.map((d) => DAY_INITIALS[d] ?? '?').join(' ')
}

interface Props {
  habit: Habit
  done: boolean
  streak: number
  onToggle: () => void
  onEdit: () => void
}

export function HabitCard({ habit, done, streak, onToggle, onEdit }: Props) {
  return (
    // @container so the card reacts to its own box, not the window: the same card
    // is one-per-row on a phone and one-of-three on a desktop.
    <article
      className={`@container rounded-2xl border p-[clamp(0.875rem,0.5rem+2cqi,1.25rem)] transition-colors ${
        done ? 'border-green-500/60 bg-green-950/40' : 'border-edge bg-panel'
      }`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={done}
          aria-label={done ? `Mark ${habit.name} not done` : `Mark ${habit.name} done`}
          className={`grid size-9 shrink-0 place-items-center rounded-full border-2 transition-transform motion-safe:active:scale-90 [@media(pointer:coarse)]:size-11 ${
            done
              ? 'border-transparent bg-green-500 text-green-950'
              : 'border-slate-500 text-transparent [@media(hover:hover)]:hover:border-slate-300'
          }`}
        >
          <span aria-hidden="true" className="text-lg font-bold leading-none">
            ✓
          </span>
        </button>

        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-start"
        >
          <span className="block truncate text-[clamp(0.9375rem,0.875rem+0.4cqi,1.0625rem)] font-semibold">
            <span aria-hidden="true" className="me-2">
              {habit.emoji}
            </span>
            {habit.name}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
            <span>{habit.remind_at.slice(0, 5)}</span>
            <span aria-hidden="true">·</span>
            <span>{scheduleWords(habit)}</span>
          </span>
        </button>

        <span
          className="shrink-0 rounded-full bg-black/25 px-2.5 py-1 text-xs font-semibold text-amber-300 tabular-nums"
          title={`${streak} in a row`}
        >
          <span aria-hidden="true">🔥</span> {streak}
        </span>
      </div>
    </article>
  )
}
