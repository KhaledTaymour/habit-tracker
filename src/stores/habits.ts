import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { setBadge } from '@/lib/badge'
import { isDueOn, streakOf, ymd } from '@/lib/streak'
import type { Completion, Habit, HabitDraft } from '@/types'

interface HabitState {
  habits: Habit[]
  completions: Completion[]
  loading: boolean
  error: string | null

  load: () => Promise<void>
  add: (draft: HabitDraft) => Promise<void>
  update: (id: string, patch: Partial<HabitDraft> & { active?: boolean }) => Promise<void>
  remove: (id: string) => Promise<void>
  toggleToday: (habitId: string) => Promise<void>
}

const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone

export const useHabits = create<HabitState>((set, get) => ({
  habits: [],
  completions: [],
  loading: true,
  error: null,

  load: async () => {
    set({ loading: true, error: null })
    const [habits, completions] = await Promise.all([
      supabase.from('habits').select('*').order('remind_at'),
      // 60 days is plenty for the streaks we display and keeps the payload small.
      supabase
        .from('habit_completions')
        .select('habit_id, done_on')
        .gte('done_on', ymd(new Date(Date.now() - 60 * 864e5))),
    ])
    const error = habits.error ?? completions.error
    if (error) {
      set({ loading: false, error: error.message })
      return
    }
    set({
      habits: habits.data ?? [],
      completions: completions.data ?? [],
      loading: false,
    })
    void syncBadge(get())
  },

  add: async (draft) => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return
    const { error } = await supabase.from('habits').insert({
      ...draft,
      user_id: user.user.id,
      tz: browserTz(),
    })
    if (error) set({ error: error.message })
    else await get().load()
  },

  update: async (id, patch) => {
    // Re-stamp tz on edit: it's the only moment we know where the user is now.
    const { error } = await supabase
      .from('habits')
      .update({ ...patch, tz: browserTz() })
      .eq('id', id)
    if (error) set({ error: error.message })
    else await get().load()
  },

  remove: async (id) => {
    const { error } = await supabase.from('habits').delete().eq('id', id)
    if (error) set({ error: error.message })
    else await get().load()
  },

  toggleToday: async (habitId) => {
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return
    const today = ymd(new Date())
    const isDone = get().completions.some((c) => c.habit_id === habitId && c.done_on === today)

    // Optimistic: a tick must feel instant. load() below reconciles.
    set((s) => ({
      completions: isDone
        ? s.completions.filter((c) => !(c.habit_id === habitId && c.done_on === today))
        : [...s.completions, { habit_id: habitId, done_on: today }],
    }))
    void syncBadge(get())

    const { error } = isDone
      ? await supabase
          .from('habit_completions')
          .delete()
          .eq('habit_id', habitId)
          .eq('done_on', today)
      : await supabase
          .from('habit_completions')
          .insert({ habit_id: habitId, user_id: user.user.id, done_on: today })

    if (error) set({ error: error.message })
    await get().load()
  },
}))

// --- selectors: plain functions, so components pick what they re-render on ---

export function dueToday(habits: Habit[], today = new Date()): Habit[] {
  return habits.filter((h) => h.active && isDueOn(h, today))
}

export function isDoneToday(completions: Completion[], habitId: string, today = new Date()): boolean {
  const key = ymd(today)
  return completions.some((c) => c.habit_id === habitId && c.done_on === key)
}

export function streakFor(
  habit: Habit,
  completions: Completion[],
  today = new Date(),
): number {
  const dates = new Set(completions.filter((c) => c.habit_id === habit.id).map((c) => c.done_on))
  return streakOf(habit, dates, today)
}

export function pendingCount(habits: Habit[], completions: Completion[], today = new Date()): number {
  return dueToday(habits, today).filter((h) => !isDoneToday(completions, h.id, today)).length
}

function syncBadge(state: Pick<HabitState, 'habits' | 'completions'>) {
  return setBadge(pendingCount(state.habits, state.completions))
}
