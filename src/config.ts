import { defaultMaskHeaders } from './sanitize.js'
import type { ResolvedConfig, SpyConfig } from './types.js'

const SDK_VERSION = '0.1.0'

const DEFAULTS = {
  appId: typeof location !== 'undefined' ? location.hostname : 'unknown',
  enabled: true,
  sampleRate: 1,
  errorStatusCodes: [400, 401, 403, 404, 408, 429, 500, 502, 503, 504] as number[],
  slowThreshold: 0,
  captureSnapshot: true,
  maxSnapshotSize: 512_000,
  snapshotTimeout: 2000,
  batchSize: 1,
  batchInterval: 0,
  maskHeaders: defaultMaskHeaders(),
  maskBodyFields: [] as string[],
  maxBodyLength: 2048,
  ignoreUrls: [] as (string | RegExp)[],
} as const

export { SDK_VERSION }

export function resolveConfig(user: SpyConfig): ResolvedConfig {
  if (!user.endpoint) throw new Error('[api-spy] config.endpoint is required')

  return {
    ...DEFAULTS,
    ...user,
    appId: user.appId ?? DEFAULTS.appId,
    maskHeaders: user.maskHeaders ?? DEFAULTS.maskHeaders,
    ignoreUrls: [
      ...(user.ignoreUrls ?? []),
      user.endpoint,
    ],
  }
}

export function isIgnoredUrl(url: string, ignoreUrls: (string | RegExp)[]): boolean {
  return ignoreUrls.some((pattern) =>
    typeof pattern === 'string' ? url.includes(pattern) : pattern.test(url),
  )
}

export function shouldTrigger(
  status: number,
  duration: number,
  error: string | undefined,
  config: ResolvedConfig,
): boolean {
  if (error !== undefined) return true
  if (status === 0) return true
  if (config.errorStatusCodes.includes(status)) return true
  if (config.slowThreshold > 0 && duration >= config.slowThreshold) return true
  return false
}

export function passesSample(sampleRate: number): boolean {
  return Math.random() < sampleRate
}
