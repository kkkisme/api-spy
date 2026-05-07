import type { ReportEvent } from '../types.js'

const STORAGE_KEY = 'api-spy:queue'
const MAX_PERSISTED = 20

/** In-memory batch buffer */
const memQueue: ReportEvent[] = []

export function enqueue(event: ReportEvent): void {
  memQueue.push(event)
}

export function dequeueAll(): ReportEvent[] {
  return memQueue.splice(0, memQueue.length)
}

export function peek(): ReportEvent[] {
  return [...memQueue]
}

/** Persist failed events to localStorage for retry on next page load */
export function persistFailed(events: ReportEvent[]): void {
  try {
    const existing = loadPersisted()
    const combined = [...existing, ...events].slice(-MAX_PERSISTED)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(combined))
  } catch {
    // localStorage might be unavailable (private mode, quota exceeded)
  }
}

export function loadPersisted(): ReportEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ReportEvent[]) : []
  } catch {
    return []
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
