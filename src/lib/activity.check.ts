// Self-check for the activity grid maths. Run: pnpm check
import assert from 'node:assert/strict'
import { activityDays, leadingBlanks, perfectDayStreak } from './activity.ts'
import { addDays, ymd } from './streak.ts'
import type { Completion, Habit } from '../types/index.ts'

const WED = new Date(2026, 6, 29)
assert.equal(WED.getDay(), 3, 'fixture drift: 2026-07-29 should be Wednesday')

const habit = (id: string, over: Partial<Habit> = {}): Habit => ({
  id,
  user_id: 'u',
  name: id,
  emoji: '✅',
  schedule_type: 'daily',
  days_of_week: [],
  remind_at: '07:00',
  tz: 'UTC',
  active: true,
  last_notified_on: null,
  created_at: '',
  ...over,
})

const on = (habitId: string, date: Date): Completion => ({
  habit_id: habitId,
  done_on: ymd(date),
})

// --- shape ---
const twoDaily = [habit('a'), habit('b')]
let cells = activityDays(twoDaily, [], WED, 7)
assert.equal(cells.length, 7, 'one cell per day')
assert.equal(cells.at(-1)?.date, ymd(WED), 'last cell is today')
assert.equal(cells[0]?.date, ymd(addDays(WED, -6)), 'first cell is the oldest')

// --- levels ---
assert.equal(cells.at(-1)?.level, 0, 'nothing done = missed')
cells = activityDays(twoDaily, [on('a', WED)], WED, 7)
assert.equal(cells.at(-1)?.done, 1)
assert.equal(cells.at(-1)?.level, 2, '1 of 2 is half, so "most" not "some"')
cells = activityDays(twoDaily, [on('a', WED), on('b', WED)], WED, 7)
assert.equal(cells.at(-1)?.level, 3, 'all done')

// 1 of 3 is under half
const threeDaily = [habit('a'), habit('b'), habit('c')]
cells = activityDays(threeDaily, [on('a', WED)], WED, 3)
assert.equal(cells.at(-1)?.level, 1, '1 of 3 = some')

// --- rest days ---
// A Monday-only habit: Wednesday has nothing scheduled.
const mondayOnly = [habit('m', { schedule_type: 'weekly', days_of_week: [1] })]
cells = activityDays(mondayOnly, [], WED, 7)
assert.equal(cells.at(-1)?.due, 0, 'Wednesday is a rest day for a Monday habit')
const monday = cells.find((c) => c.date === ymd(addDays(WED, -2)))
assert.equal(monday?.due, 1, 'Monday is scheduled')

// --- done can never exceed due (schedule was edited after the fact) ---
cells = activityDays(mondayOnly, [on('m', WED)], WED, 3)
assert.equal(cells.at(-1)?.done, 0, 'a completion on an unscheduled day is clamped away')

// --- inactive habits are excluded ---
cells = activityDays([habit('x', { active: false })], [], WED, 3)
assert.equal(cells.at(-1)?.due, 0)

// --- leading blanks put the first cell on its weekday row ---
assert.equal(leadingBlanks('2026-07-26'), 0, 'Sunday needs no padding')
assert.equal(leadingBlanks('2026-07-29'), 3, 'Wednesday sits on row 3')

// --- perfect-day streak ---
const allDays = [addDays(WED, -2), addDays(WED, -1), WED]
const perfect = allDays.flatMap((d) => [on('a', d), on('b', d)])
assert.equal(perfectDayStreak(activityDays(twoDaily, perfect, WED, 3)), 3)

// today unfinished is a grace day, not a break
const yesterdayBack = perfect.filter((c) => c.done_on !== ymd(WED))
assert.equal(perfectDayStreak(activityDays(twoDaily, yesterdayBack, WED, 3)), 2, 'today is grace')

// an earlier miss does break it
const gap = [on('a', WED), on('b', WED), on('a', addDays(WED, -2)), on('b', addDays(WED, -2))]
assert.equal(perfectDayStreak(activityDays(twoDaily, gap, WED, 3)), 1, 'yesterday missed')

// rest days neither break nor count
assert.equal(
  perfectDayStreak(activityDays(mondayOnly, [on('m', addDays(WED, -2))], WED, 7)),
  1,
  'only the scheduled Monday counts; the rest days are skipped',
)

console.log('activity: all checks passed')
