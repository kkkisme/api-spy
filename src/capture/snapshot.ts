import type { ResolvedConfig, RequestContext } from '../types.js'
import { scheduleIdle } from '../utils/idle.js'

/**
 * Schedule a non-blocking page snapshot.
 *
 * - Runs inside requestIdleCallback (falls back to setTimeout)
 * - Hard timeout: if capture takes longer than config.snapshotTimeout, resolves null
 * - Result is compressed if it exceeds config.maxSnapshotSize
 */
export function scheduleSnapshot(
  ctx: RequestContext,
  config: ResolvedConfig,
): Promise<string | null> {
  return new Promise((resolve) => {
    scheduleIdle(() => {
      captureWithTimeout(ctx, config).then(resolve)
    }, config.snapshotTimeout)
  })
}

async function captureWithTimeout(
  ctx: RequestContext,
  config: ResolvedConfig,
): Promise<string | null> {
  if (!config.captureSnapshot) return null

  const engine = config.captureEngine ?? defaultEngine
  if (!engine) return null

  const timeout = new Promise<null>((resolve) =>
    setTimeout(() => resolve(null), config.snapshotTimeout),
  )

  let dataUrl: string | null
  try {
    dataUrl = await Promise.race([engine(ctx), timeout])
  } catch {
    return null
  }

  if (!dataUrl) return null

  // Rough size estimate: base64 ≈ 0.75 × encoded length
  const approxBytes = Math.ceil((dataUrl.length * 3) / 4)
  if (approxBytes > config.maxSnapshotSize) {
    // Try to downsample by re-drawing onto a smaller canvas
    const compressed = await compressDataUrl(dataUrl, config.maxSnapshotSize)
    return compressed
  }

  return dataUrl
}

async function compressDataUrl(
  dataUrl: string,
  maxBytes: number,
): Promise<string | null> {
  try {
    const img = await loadImage(dataUrl)
    const scale = Math.sqrt(maxBytes / Math.ceil((dataUrl.length * 3) / 4))
    const w = Math.max(1, Math.floor(img.naturalWidth * scale))
    const h = Math.max(1, Math.floor(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return null
    ctx2d.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

let _defaultEngine: ResolvedConfig['captureEngine'] | null | undefined = undefined

async function defaultEngine(ctx: RequestContext): Promise<string | null> {
  // Lazy-resolve on first call to avoid loading snapdom at SDK init time
  if (_defaultEngine === undefined) {
    try {
      const { snapdomCapture } = await import('./engines/snapdom.js')
      _defaultEngine = snapdomCapture
    } catch {
      _defaultEngine = null
    }
  }
  if (!_defaultEngine) return null
  return _defaultEngine(ctx)
}
