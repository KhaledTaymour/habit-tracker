import type { Habit } from '@/types'

/** Local calendar date as 'YYYY-MM-DD'. Hand-formatted, not toLocaleDateString —
 *  locale output varies by environment and this value is a database key. */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Is this habit scheduled on this date? Ignores whether it was done. */
export function isDueOn(habit: Pick<Habit, 'schedule_type' | 'days_of_week'>, date: Date): boolean {
  if (habit.schedule_type === 'daily') return true
  return habit.days_of_week.includes(date.getDay())
}

/**
 * How many scheduled days in a row, counting back from today, were ticked.
 * Stops at the first scheduled day that was missed. Unscheduled days are skipped,
 * so a weekday habit is not broken by an untouched Saturday.
 *
 * Today is a grace day: if it's scheduled and not yet done, the day isn't over,
 * so we look past it rather than calling it a miss.
 */
export function streakOf(
  habit: Pick<Habit, 'schedule_type' | 'days_of_week'>,
  doneDates: ReadonlySet<string>,
  today: Date,
): number {
  let streak = 0
  let cursor = today

  if (isDueOn(habit, cursor)) {
    if (doneDates.has(ymd(cursor))) streak++
    // not done yet → grace, fall through to yesterday without breaking
  }
  cursor = addDays(cursor, -1)

  // Known ceiling: 365-day lookback. Longer streaks display as 365; raise it if
  // anyone ever gets there.
  for (let i = 0; i < 365; i++) {
    if (isDueOn(habit, cursor)) {
      if (!doneDates.has(ymd(cursor))) break
      streak++
    }
    cursor = addDays(cursor, -1)
  }

  return streak
}
