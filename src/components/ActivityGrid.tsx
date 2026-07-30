import { activityDays, leadingBlanks, perfectDayStreak } from '@/lib/activity'
import type { Completion, Habit } from '@/types'

/** 10 weeks. The store loads 90 days of completions, so this always has data
 *  behind it — widen both together or the oldest columns go blank. */
const DAYS = 70

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const

const LEVEL_STYLE = [
  'bg-slate-700/50', // 0 — scheduled, nothing done
  'bg-green-900',    // 1 — some
  'bg-green-700',    // 2 — most
  'bg-green-500',    // 3 — all of it
] as const

const REST_STYLE = 'bg-white/5' // nothing was scheduled

interface Props {
  habits: Habit[]
  completions: Completion[]
}

export function ActivityGrid({ habits, completions }: Props) {
  const cells = activityDays(habits, completions, new Date(), DAYS)
  const blanks = leadingBlanks(cells[0]?.date ?? '')
  const streak = perfectDayStreak(cells)
  const perfectDays = cells.filter((c) => c.due > 0 && c.done >= c.due).length

  return (
    <section className="@container flex flex-col gap-3">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Activity
        </h2>
        <p className="text-xs text-slate-500">
          {streak > 0 && (
            <span className="font-semibold text-amber-300">
              <span aria-hidden="true">🔥</span> {streak} perfect day
              {streak === 1 ? '' : 's'} in a row
            </span>
          )}
          {streak > 0 && perfectDays > streak && <span aria-hidden="true"> · </span>}
          {perfectDays > streak && <span>{perfectDays} perfect in 10 weeks</span>}
        </p>
      </header>

      {/* Scrolls inside itself on a narrow screen so the page never scrolls sideways. */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-1.5">
          {/* Weekday rail. Only alternate labels, or they collide at small sizes. */}
          <div className="grid grid-rows-[repeat(7,minmax(0,1fr))] gap-[3px] pe-1 text-[0.625rem] leading-none text-slate-600">
            {WEEKDAYS.map((day, row) => (
              <span key={row} className="flex items-center justify-end">
                {row % 2 === 1 ? day : ''}
              </span>
            ))}
          </div>

          {/* 7 rows, filling top-to-bottom then left-to-right, so each column is a
              week and each row is a weekday — same shape as GitHub's. */}
          <div className="grid grid-flow-col grid-rows-[repeat(7,minmax(0,1fr))] gap-[3px]">
            {Array.from({ length: blanks }, (_, i) => (
              <span key={`blank-${i}`} className="size-[clamp(0.625rem,0.5rem+0.6cqi,0.9375rem)]" />
            ))}
            {cells.map((cell) => (
              <span
                key={cell.date}
                title={
                  cell.due === 0
                    ? `${cell.date} — nothing scheduled`
                    : `${cell.date} — ${cell.done} of ${cell.due} done`
                }
                className={`size-[clamp(0.625rem,0.5rem+0.6cqi,0.9375rem)] rounded-[2px] ${
                  cell.due === 0 ? REST_STYLE : LEVEL_STYLE[cell.level]
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.625rem] text-slate-600">
        <span>missed</span>
        <span className="size-2.5 rounded-[2px] bg-slate-700/50" />
        <span className="size-2.5 rounded-[2px] bg-green-900" />
        <span className="size-2.5 rounded-[2px] bg-green-700" />
        <span className="size-2.5 rounded-[2px] bg-green-500" />
        <span>all done</span>
        <span className="ms-2 flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-white/5" />
          rest day
        </span>
      </div>
    </section>
  )
}
