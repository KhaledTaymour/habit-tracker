/** 'days' carries daysOfWeek; 'weekly' uses the single day in daysOfWeek[0]. */
export type ScheduleType = 'daily' | 'days' | 'weekly'

/** 0 = Sunday … 6 = Saturday, matching JS getDay(). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export interface Habit {
  id: string
  user_id: string
  name: string
  emoji: string
  schedule_type: ScheduleType
  days_of_week: number[]
  /** 'HH:MM' in the habit's own timezone. */
  remind_at: string
  /** IANA zone, e.g. 'Asia/Riyadh'. See DESIGN.md §4 for why it lives here. */
  tz: string
  active: boolean
  last_notified_on: string | null
  created_at: string
}

export interface Completion {
  habit_id: string
  /** 'YYYY-MM-DD' local date. */
  done_on: string
}

export type HabitDraft = Pick<
  Habit,
  'name' | 'emoji' | 'schedule_type' | 'days_of_week' | 'remind_at'
>
