import { useState } from 'react'
import type { Habit, HabitDraft, ScheduleType } from '@/types'

const DAYS = [
  { value: 0, label: 'S', name: 'Sunday' },
  { value: 1, label: 'M', name: 'Monday' },
  { value: 2, label: 'T', name: 'Tuesday' },
  { value: 3, label: 'W', name: 'Wednesday' },
  { value: 4, label: 'T', name: 'Thursday' },
  { value: 5, label: 'F', name: 'Friday' },
  { value: 6, label: 'S', name: 'Saturday' },
] as const

const REPEATS: Array<{ value: ScheduleType; label: string }> = [
  { value: 'daily', label: 'Every day' },
  { value: 'days', label: 'Certain days' },
  { value: 'weekly', label: 'Once a week' },
]

interface Props {
  habit?: Habit
  onSave: (draft: HabitDraft) => void
  onDelete?: () => void
  onClose: () => void
}

export function HabitForm({ habit, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(habit?.name ?? '')
  const [emoji, setEmoji] = useState(habit?.emoji ?? '✅')
  const [scheduleType, setScheduleType] = useState<ScheduleType>(habit?.schedule_type ?? 'daily')
  const [days, setDays] = useState<number[]>(habit?.days_of_week ?? [1, 2, 3, 4, 5])
  const [remindAt, setRemindAt] = useState(habit?.remind_at.slice(0, 5) ?? '07:00')

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const trimmed = name.trim()
  // Mirrors the CHECK constraints in 0001_init.sql — the database is the real
  // guard, this only keeps the button from submitting something it will reject.
  const daysOk = scheduleType === 'daily' || days.length > 0
  const canSave = trimmed.length > 0 && trimmed.length <= 80 && daysOk

  function toggleDay(value: number) {
    if (scheduleType === 'weekly') {
      setDays([value])
      return
    }
    setDays((current) =>
      current.includes(value) ? current.filter((d) => d !== value) : [...current, value],
    )
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSave) return
    onSave({
      name: trimmed,
      emoji: emoji.trim() || '✅',
      schedule_type: scheduleType,
      days_of_week: scheduleType === 'daily' ? [] : days,
      remind_at: remindAt,
    })
  }

  return (
    <div className="fixed inset-0 z-50 grid overflow-y-auto bg-ink/95 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="mx-auto flex w-full max-w-[30rem] flex-col gap-[clamp(1rem,3cqi,1.5rem)] p-[clamp(1rem,4cqi,2rem)]"
      >
        <header className="flex items-center justify-between gap-4">
          <h2 className="text-[clamp(1.25rem,1rem+2cqi,1.75rem)] font-semibold">
            {habit ? 'Edit habit' : 'New habit'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-10 place-items-center rounded-full text-slate-400 [@media(hover:hover)]:hover:bg-panel [@media(hover:hover)]:hover:text-slate-100"
          >
            ✕
          </button>
        </header>

        <div className="flex items-end gap-3">
          <label className="flex-1">
            <span className="mb-1.5 block text-xs text-slate-400">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              autoFocus
              placeholder="Read 20 pages"
              className="w-full rounded-xl border border-edge bg-panel px-3 py-2.5 text-start text-base outline-none focus-visible:border-accent"
            />
          </label>
          <label className="w-16">
            <span className="mb-1.5 block text-xs text-slate-400">Icon</span>
            <input
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={8}
              className="w-full rounded-xl border border-edge bg-panel px-2 py-2.5 text-center text-xl outline-none focus-visible:border-accent"
            />
          </label>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-xs text-slate-400">Repeat</legend>
          {/* Intrinsic: fits 3 across when there's room, wraps when there isn't. */}
          <div className="grid grid-cols-[repeat(auto-fit,minmax(7rem,1fr))] gap-2">
            {REPEATS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-sm transition-colors has-checked:border-accent has-checked:bg-accent has-checked:font-semibold ${
                  scheduleType === option.value ? 'border-accent bg-accent' : 'border-edge bg-panel'
                }`}
              >
                <input
                  type="radio"
                  name="repeat"
                  value={option.value}
                  checked={scheduleType === option.value}
                  onChange={() => {
                    setScheduleType(option.value)
                    if (option.value === 'weekly') setDays((d) => [d[0] ?? 1])
                    if (option.value === 'days' && days.length === 0) setDays([1, 2, 3, 4, 5])
                  }}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        {scheduleType !== 'daily' && (
          <fieldset>
            <legend className="mb-1.5 text-xs text-slate-400">
              {scheduleType === 'weekly' ? 'Which day' : 'Which days'}
            </legend>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => {
                const on = days.includes(day.value)
                return (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    aria-pressed={on}
                    aria-label={day.name}
                    className={`size-10 rounded-full border text-sm font-medium transition-colors [@media(pointer:coarse)]:size-12 ${
                      on
                        ? 'border-transparent bg-accent text-white'
                        : 'border-edge bg-panel text-slate-400 [@media(hover:hover)]:hover:text-slate-100'
                    }`}
                  >
                    {day.label}
                  </button>
                )
              })}
            </div>
            {!daysOk && (
              <p className="mt-2 text-xs text-red-400">Pick at least one day.</p>
            )}
          </fieldset>
        )}

        <label>
          <span className="mb-1.5 block text-xs text-slate-400">Remind me at</span>
          <div className="flex flex-wrap items-center gap-3">
            {/* Native time input: the OS picker is better than any library, and
                free on every platform. */}
            <input
              type="time"
              value={remindAt}
              onChange={(e) => setRemindAt(e.target.value)}
              required
              className="rounded-xl border border-edge bg-panel px-3 py-2.5 text-base tabular-nums outline-none focus-visible:border-accent"
            />
            <span className="text-xs text-slate-500">{tz}</span>
          </div>
        </label>

        <div className="mt-2 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!canSave}
            className="flex-1 rounded-full bg-accent px-6 py-3 font-semibold text-white transition-transform disabled:opacity-40 motion-safe:active:scale-[0.98] [@media(pointer:coarse)]:py-4"
          >
            Save
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-full border border-red-500/60 px-5 py-3 font-medium text-red-400 [@media(hover:hover)]:hover:bg-red-500/10 [@media(pointer:coarse)]:py-4"
            >
              Delete
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
