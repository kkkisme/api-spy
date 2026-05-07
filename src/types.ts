export interface RequestContext {
  id: string
  type: 'xhr' | 'fetch'
  method: string
  url: string
  requestHeaders: Record<string, string>
  requestBody: string | null
  status: number
  responseHeaders: Record<string, string>
  responseBody: string | null
  duration: number
  timestamp: number
  error?: string | undefined
}

export interface PageContext {
  url: string
  title: string
  userAgent: string
  viewport: { width: number; height: number }
  snapshot: string | null
}

export interface ReportEvent {
  sdkVersion: string
  appId: string
  request: RequestContext
  page: PageContext
  extra?: Record<string, unknown>
}

export interface SpyConfig {
  endpoint: string
  appId?: string
  enabled?: boolean
  sampleRate?: number

  errorStatusCodes?: number[]
  slowThreshold?: number
  shouldCapture?: (ctx: RequestContext) => boolean

  captureSnapshot?: boolean
  maxSnapshotSize?: number
  snapshotTimeout?: number
  captureEngine?: (ctx: RequestContext) => Promise<string | null>

  batchSize?: number
  batchInterval?: number
  beforeSend?: (event: ReportEvent) => ReportEvent | null
  transport?: (events: ReportEvent[]) => Promise<void>
  enrichEvent?: (event: ReportEvent) => ReportEvent

  maskHeaders?: string[]
  maskBodyFields?: string[]
  maxBodyLength?: number
  ignoreUrls?: (string | RegExp)[]
}

export type ResolvedConfig = Required<
  Omit<SpyConfig, 'shouldCapture' | 'captureEngine' | 'beforeSend' | 'transport' | 'enrichEvent'>
> &
  Pick<SpyConfig, 'shouldCapture' | 'captureEngine' | 'beforeSend' | 'transport' | 'enrichEvent'>
