import { originalFetch } from '../interceptors/fetch.js'
import type { ReportEvent, ResolvedConfig } from '../types.js'
import { clearPersisted, loadPersisted, persistFailed } from './queue.js'

const BEACON_SIZE_LIMIT = 64 * 1024 // 64 KB

/**
 * Send events to the configured endpoint.
 * Order of preference:
 *   1. Custom transport (if provided)
 *   2. sendBeacon (fire-and-forget, page-unload safe)
 *   3. fetch with keepalive (fallback for large payloads)
 */
export async function send(events: ReportEvent[], config: ResolvedConfig): Promise<void> {
  if (events.length === 0) return

  // Apply beforeSend hook — filter nulls
  const filtered = applyHooks(events, config)
  if (filtered.length === 0) return

  if (config.transport) {
    try {
      await config.transport(filtered)
    } catch {
      persistFailed(filtered)
    }
    return
  }

  const body = JSON.stringify(filtered)
  const blob = new Blob([body], { type: 'application/json' })

  // sendBeacon: best-effort, no response, size-limited
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.sendBeacon === 'function' &&
    blob.size <= BEACON_SIZE_LIMIT
  ) {
    const ok = navigator.sendBeacon(config.endpoint, blob)
    if (ok) return
  }

  // Fallback: use the original (un-patched) fetch with keepalive
  try {
    await originalFetch(config.endpoint, {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    })
  } catch {
    persistFailed(filtered)
  }
}

/** Flush persisted (retry) queue from previous page session */
export async function flushPersisted(config: ResolvedConfig): Promise<void> {
  const stored = loadPersisted()
  if (stored.length === 0) return
  clearPersisted()
  await send(stored, config)
}

function applyHooks(events: ReportEvent[], config: ResolvedConfig): ReportEvent[] {
  return events
    .map((e) => {
      const enriched = config.enrichEvent ? config.enrichEvent(e) : e
      return config.beforeSend ? config.beforeSend(enriched) : enriched
    })
    .filter((e): e is ReportEvent => e !== null)
}
