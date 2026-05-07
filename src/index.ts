import { resolveConfig, SDK_VERSION } from './config.js'
import { patchFetch } from './interceptors/fetch.js'
import { patchXhr } from './interceptors/xhr.js'
import { scheduleSnapshot } from './capture/snapshot.js'
import { dequeueAll, enqueue, peek } from './reporter/queue.js'
import { flushPersisted, send } from './reporter/transport.js'
import type { PageContext, ReportEvent, RequestContext, ResolvedConfig, SpyConfig } from './types.js'

export type { ReportEvent, RequestContext, PageContext, SpyConfig }

let _config: ResolvedConfig | null = null
let _restoreXhr: (() => void) | null = null
let _restoreFetch: (() => void) | null = null
let _batchTimer: ReturnType<typeof setTimeout> | null = null
let _initialized = false

/**
 * Initialize api-spy. Idempotent — subsequent calls are no-ops.
 */
function init(userConfig: SpyConfig): void {
  if (_initialized) return
  _initialized = true

  _config = resolveConfig(userConfig)

  _restoreXhr = patchXhr(_config, handleError)
  _restoreFetch = patchFetch(_config, handleError)

  // Flush events that failed to send in the previous page session
  void flushPersisted(_config)
}

function enable(): void {
  if (_config) _config.enabled = true
}

function disable(): void {
  if (_config) _config.enabled = false
}

/**
 * Manually report an event (bypasses trigger conditions and sampling).
 */
async function report(partial: Partial<ReportEvent>): Promise<void> {
  if (!_config) throw new Error('[api-spy] Call spy.init() before spy.report()')

  const event = buildEvent(
    {
      id: partial.request?.id ?? '',
      type: partial.request?.type ?? 'fetch',
      method: partial.request?.method ?? 'GET',
      url: partial.request?.url ?? location.href,
      requestHeaders: partial.request?.requestHeaders ?? {},
      requestBody: partial.request?.requestBody ?? null,
      status: partial.request?.status ?? 0,
      responseHeaders: partial.request?.responseHeaders ?? {},
      responseBody: partial.request?.responseBody ?? null,
      duration: partial.request?.duration ?? 0,
      timestamp: partial.request?.timestamp ?? Date.now(),
      ...(partial.request?.error !== undefined ? { error: partial.request.error } : {}),
    },
    null,
    _config,
  )

  await send([{ ...event, ...partial }], _config)
}

/**
 * Tear down all patches and flush pending events.
 */
async function destroy(): Promise<void> {
  if (_batchTimer !== null) {
    clearTimeout(_batchTimer)
    _batchTimer = null
  }

  if (_config) {
    const pending = dequeueAll()
    if (pending.length > 0) await send(pending, _config)
  }

  _restoreXhr?.()
  _restoreFetch?.()
  _restoreXhr = null
  _restoreFetch = null
  _config = null
  _initialized = false
}

function getQueue(): ReportEvent[] {
  return peek()
}

// ─── Internal ────────────────────────────────────────────────────────────────

function handleError(ctx: RequestContext): void {
  if (!_config) return

  // Fire-and-forget — do not await, keep error handler synchronous
  void processError(ctx, _config)
}

async function processError(ctx: RequestContext, config: ResolvedConfig): Promise<void> {
  const snapshot = await scheduleSnapshot(ctx, config)
  const event = buildEvent(ctx, snapshot, config)

  if (config.batchSize <= 1 && config.batchInterval === 0) {
    await send([event], config)
    return
  }

  enqueue(event)
  scheduleBatchFlush(config)
}

function scheduleBatchFlush(config: ResolvedConfig): void {
  if (_batchTimer !== null) return

  _batchTimer = setTimeout(async () => {
    _batchTimer = null
    const batch = dequeueAll()
    if (batch.length > 0) await send(batch, config)
  }, config.batchInterval)
}

function buildEvent(
  ctx: RequestContext,
  snapshot: string | null,
  config: ResolvedConfig,
): ReportEvent {
  const page: PageContext = {
    url: typeof location !== 'undefined' ? location.href : '',
    title: typeof document !== 'undefined' ? document.title : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    viewport: {
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
    },
    snapshot,
  }

  return {
    sdkVersion: SDK_VERSION,
    appId: config.appId,
    request: ctx,
    page,
  }
}

export const spy = { init, enable, disable, report, destroy, getQueue }
export default spy

// ─── Script-tag auto-init ─────────────────────────────────────────────────────
// Reads data-* attributes from the <script> tag that loaded this file and
// calls spy.init() automatically. Only activates when data-endpoint is present.
//
// Supported attributes (all optional except data-endpoint):
//   data-endpoint          upload URL (required to trigger auto-init)
//   data-app-id            overrides appId
//   data-sample-rate       0–1
//   data-capture-snapshot  "false" to disable
//   data-slow-threshold    ms, 0 = disabled
//   data-batch-size        number of events per send
//   data-batch-interval    ms between batch flushes
//   data-max-body-length   max request/response body bytes kept
//   data-snapshot-timeout  ms before snapshot is abandoned
;(function autoInit() {
  if (typeof document === 'undefined') return

  // document.currentScript is set while the script executes synchronously.
  // For deferred / async scripts it may be null — fall back to querySelector.
  const scriptEl =
    (document.currentScript as HTMLScriptElement | null) ??
    (document.querySelector('script[src*="api-spy"]') as HTMLScriptElement | null)

  if (!scriptEl) return

  const d = scriptEl.dataset
  if (!d['endpoint']) return   // opt-in: only auto-init when endpoint is set

  const cfg: SpyConfig = {
    endpoint: d['endpoint'],
  }

  if (d['appId'] !== undefined)           cfg.appId           = d['appId']
  if (d['sampleRate'] !== undefined)      cfg.sampleRate      = Number(d['sampleRate'])
  if (d['captureSnapshot'] !== undefined) cfg.captureSnapshot = d['captureSnapshot'] !== 'false'
  if (d['slowThreshold'] !== undefined)   cfg.slowThreshold   = Number(d['slowThreshold'])
  if (d['batchSize'] !== undefined)       cfg.batchSize       = Number(d['batchSize'])
  if (d['batchInterval'] !== undefined)   cfg.batchInterval   = Number(d['batchInterval'])
  if (d['maxBodyLength'] !== undefined)    cfg.maxBodyLength    = Number(d['maxBodyLength'])
  if (d['maxSnapshotSize'] !== undefined)  cfg.maxSnapshotSize  = Number(d['maxSnapshotSize'])
  if (d['snapshotTimeout'] !== undefined)  cfg.snapshotTimeout  = Number(d['snapshotTimeout'])

  spy.init(cfg)
})()
