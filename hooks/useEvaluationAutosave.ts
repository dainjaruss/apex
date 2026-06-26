// hooks/useEvaluationAutosave.ts
//
// Client-side draft autosave for the evaluation form. Persists in-progress
// selections/entries to localStorage (NOT the database) so a refresh, accidental
// navigation, or closed tab can be recovered. The explicit "Save Evaluation Draft"
// button is the only thing that writes to the database; on a successful DB save the
// local copy is cleared via clear().

import { useCallback, useEffect, useRef, useState } from 'react'

const PREFIX = 'apex:eval-draft:'
const DEBOUNCE_MS = 600

export interface StoredDraft<T> {
  savedAt: number
  step?: number
  data: T
}

/** Stable per-evaluation key: the DB id when editing, else a per-user "new" slot. */
export function draftStorageKey(opts: { id?: string; createdBy?: string }): string {
  return opts.id ? `${PREFIX}eval:${opts.id}` : `${PREFIX}new:${opts.createdBy ?? 'anon'}`
}

/** Synchronous read for first-render hydration. Returns null if absent/corrupt. */
export function readEvalDraft<T>(key: string): StoredDraft<T> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<T>
    return parsed && parsed.data ? parsed : null
  } catch {
    return null
  }
}

interface Options<T> {
  key: string
  data: T
  step?: number
  /** Set false after a successful DB save (or to pause persistence). */
  enabled?: boolean
}

export function useEvaluationAutosave<T>({ key, data, step, enabled = true }: Options<T>) {
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const skipFirst = useRef(true)
  const latest = useRef<{ data: T; step?: number }>({ data, step })
  const enabledRef = useRef(enabled)

  // Keep a live snapshot for the flush-on-hide handlers below.
  latest.current = { data, step }
  enabledRef.current = enabled

  const write = useCallback(
    (d: T, s?: number) => {
      if (typeof window === 'undefined') return
      try {
        const rec: StoredDraft<T> = { savedAt: Date.now(), step: s, data: d }
        window.localStorage.setItem(key, JSON.stringify(rec))
        setSavedAt(rec.savedAt)
      } catch {
        /* quota / private-mode — autosave is best-effort */
      }
    },
    [key]
  )

  // Debounced persist on every change. Skip the initial mount so simply opening a
  // form doesn't manufacture a "draft" before the user has touched anything.
  useEffect(() => {
    if (!enabled) return
    if (skipFirst.current) {
      skipFirst.current = false
      return
    }
    const t = setTimeout(() => write(data, step), DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [data, step, enabled, write])

  // Flush immediately when the tab is hidden or unloaded (covers fast tab-close).
  useEffect(() => {
    const flush = () => {
      if (enabledRef.current) write(latest.current.data, latest.current.step)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [write])

  /** Remove the local draft and stop persisting (call after a successful DB save). */
  const clear = useCallback(() => {
    enabledRef.current = false
    skipFirst.current = true // swallow the state reset that follows a discard
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(key)
      } catch {
        /* ignore */
      }
    }
    setSavedAt(null)
  }, [key])

  return { savedAt, clear }
}
