import type { Completion, Habit } from '@/types'
// Explicit .ts so this module also runs under plain `node` for activity.check.ts.
import { addDays, isDueOn, ymd } from './streak.ts'

export interface DayCell {
  date: string
  /** How many habits were scheduled that day. 0 = a rest day, drawn faint. */
  due: number
  done: number
  /** 0 missed · 1 some · 2 most · 3 all. Meaningless when due is 0. */
  level: 0 | 1 | 2 | 3
}

function level(due: number, done: number): 0 | 1 | 2 | 3 {
  if (done === 0) return 0
  if (done >= due) return 3
  return done / due < 0.5 ? 1 : 2
}

/**
 * One cell per day, oldest first, ending today.
 *
 * ponytail: past days are scored against each habit's *current* schedule, because
 * we don't store schedule history. Change a habit from daily to Mondays and its
 * older cells re-score. Storing history would mean a versioned schedule table —
 * not worth it until someone actually complains.
 */
export function activityDays(
  habits: Habit[],
  completions: Completion[],
  today: Date,
  days: number,
): DayCell[] {
  const doneByDate = new Map<string, number>()
  for (const c of completions) {
    doneByDate.set(c.done_on, (doneByDate.get(c.done_on) ?? 0) + 1)
  }

  const cells: DayCell[] = []
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = addDays(today, -offset)
    const key = ymd(date)
    const due = habits.filter((h) => h.active && isDueOn(h, date)).length
    // Completions can outnumber what's currently scheduled (see the note above),
    // so clamp rather than letting a ratio exceed 1.
    const done = Math.min(doneByDate.get(key) ?? 0, due)
    cells.push({ date: key, due, done, level: level(due, done) })
  }
  return cells
}

/**
 * Empty slots to prepend so the first real cell sits on its own weekday row,
 * given a grid that fills top-to-bottom then left-to-right.
 */
export function leadingBlanks(firstDate: string): number {
  const [y, m, d] = firstDate.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()
}

/** Consecutive days ending today where everything scheduled got done. Rest days
 *  (nothing scheduled) neither break it nor count toward it.
 *
 *  Today is a grace day, matching streakOf: the day isn't over, so an unfinished
 *  today looks past itself instead of reading as a failure. */
export function perfectDayStreak(cells: DayCell[]): number {
  let streak = 0
  for (let i = cells.length - 1; i >= 0; i--) {
    const cell = cells[i]
    if (!cell) break
    if (cell.due === 0) continue
    if (cell.done < cell.due) {
      if (i === cells.length - 1) continue // today, still in progress
      break
    }
    streak++
  }
  return streak
}
