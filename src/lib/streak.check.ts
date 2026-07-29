// Self-check for the one piece of non-obvious logic. Run: pnpm check
// No framework — node 22+ strips the types and runs this directly.
import assert from 'node:assert/strict'
import { streakOf, isDueOn, ymd, addDays } from './streak.ts'

const daily = { schedule_type: 'daily' as const, days_of_week: [] }
const weekdays = { schedule_type: 'days' as const, days_of_week: [1, 2, 3, 4, 5] }
const sundays = { schedule_type: 'weekly' as const, days_of_week: [0] }

const WED = new Date(2026, 6, 29)
const SUN = new Date(2026, 6, 26)
assert.equal(WED.getDay(), 3, 'fixture drift: 2026-07-29 should be Wednesday')
assert.equal(SUN.getDay(), 0, 'fixture drift: 2026-07-26 should be Sunday')

const done = (...dates: Date[]) => new Set(dates.map(ymd))
const back = (from: Date, ...offsets: number[]) => offsets.map((n) => addDays(from, n))

// ymd pads and does not shift
assert.equal(ymd(new Date(2026, 0, 5)), '2026-01-05')

// isDueOn
assert.equal(isDueOn(daily, SUN), true, 'daily is due every day')
assert.equal(isDueOn(weekdays, SUN), false, 'weekday habit is not due on Sunday')
assert.equal(isDueOn(sundays, SUN), true, 'weekly Sunday habit is due on Sunday')

// daily: three in a row including today
assert.equal(streakOf(daily, done(...back(WED, 0, -1, -2)), WED), 3)

// daily: today not ticked yet is a grace day, not a miss
assert.equal(streakOf(daily, done(...back(WED, -1, -2)), WED), 2)

// daily: nothing done at all
assert.equal(streakOf(daily, done(), WED), 0)

// daily: a gap stops the count
assert.equal(streakOf(daily, done(...back(WED, 0, -1, -3, -4)), WED), 2)

// weekdays: an untouched weekend does not break the streak.
// Today is Sunday (unscheduled); Fri and Thu were ticked; Wed was not.
assert.equal(streakOf(weekdays, done(...back(SUN, -2, -3)), SUN), 2)

// weekdays: ticking a day that isn't scheduled earns nothing
assert.equal(streakOf(weekdays, done(SUN), SUN), 0)

// weekly: counts weeks, not days
assert.equal(streakOf(sundays, done(...back(SUN, 0, -7, -14)), SUN), 3)
assert.equal(streakOf(sundays, done(...back(SUN, 0, -14)), SUN), 1, 'missed week stops it')

console.log('streak: all checks passed')
