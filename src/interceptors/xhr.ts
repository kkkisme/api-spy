import { isIgnoredUrl, passesSample, shouldTrigger } from '../config.js'
import { maskBodyFields, maskHeaders, truncate } from '../sanitize.js'
import type { ResolvedConfig, RequestContext } from '../types.js'
import { nanoid } from '../utils/id.js'

type ErrorHandler = (ctx: RequestContext) => void

export function patchXhr(config: ResolvedConfig, onError: ErrorHandler): () => void {
  // Capture at call time so nested patches restore correctly
  const OriginalXHR = window.XMLHttpRequest

  function PatchedXHR(this: XMLHttpRequest) {
    const native = new OriginalXHR()

    let method = 'GET'
    let url = ''
    const reqHeaders: Record<string, string> = {}
    let reqBody: string | null = null
    let startTime = 0

    // open
    this.open = function (
      m: string,
      u: string | URL,
      async?: boolean,
      user?: string | null,
      password?: string | null,
    ) {
      method = m.toUpperCase()
      url = u.toString()
      native.open.call(
        native,
        m,
        u,
        async ?? true,
        user ?? null,
        password ?? null,
      )
    }

    // setRequestHeader
    this.setRequestHeader = function (name: string, value: string) {
      reqHeaders[name] = value
      native.setRequestHeader.call(native, name, value)
    }

    // send
    this.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
      startTime = Date.now()

      if (typeof body === 'string') {
        reqBody = truncate(body, config.maxBodyLength)
      } else if (body instanceof URLSearchParams) {
        reqBody = truncate(body.toString(), config.maxBodyLength)
      }

      native.addEventListener('readystatechange', function () {
        if (native.readyState !== 4) return

        const duration = Date.now() - startTime
        const status = native.status

        if (isIgnoredUrl(url, config.ignoreUrls)) return
        if (!config.enabled) return

        const rawRespHeaders = native.getAllResponseHeaders()
        const respHeaders = parseRawHeaders(rawRespHeaders)
        const respBody = truncate(
          maskBodyFields(native.responseText ?? null, config.maskBodyFields),
          config.maxBodyLength,
        )

        const ctx: RequestContext = {
          id: nanoid(),
          type: 'xhr',
          method,
          url,
          requestHeaders: maskHeaders(reqHeaders, config.maskHeaders),
          requestBody: maskBodyFields(reqBody, config.maskBodyFields),
          status,
          responseHeaders: maskHeaders(respHeaders, config.maskHeaders),
          responseBody: respBody,
          duration,
          timestamp: startTime,
        }

        if (!shouldTrigger(status, duration, undefined, config)) return
        if (config.shouldCapture && !config.shouldCapture(ctx)) return
        if (!passesSample(config.sampleRate)) return

        onError(ctx)
      })

      native.addEventListener('error', function () {
        if (isIgnoredUrl(url, config.ignoreUrls)) return
        if (!config.enabled) return

        const ctx: RequestContext = {
          id: nanoid(),
          type: 'xhr',
          method,
          url,
          requestHeaders: maskHeaders(reqHeaders, config.maskHeaders),
          requestBody: maskBodyFields(reqBody, config.maskBodyFields),
          status: 0,
          responseHeaders: {},
          responseBody: null,
          duration: Date.now() - startTime,
          timestamp: startTime,
          error: 'Network error',
        }

        if (!passesSample(config.sampleRate)) return
        if (config.shouldCapture && !config.shouldCapture(ctx)) return
        onError(ctx)
      })

      native.addEventListener('timeout', function () {
        if (isIgnoredUrl(url, config.ignoreUrls)) return
        if (!config.enabled) return

        const ctx: RequestContext = {
          id: nanoid(),
          type: 'xhr',
          method,
          url,
          requestHeaders: maskHeaders(reqHeaders, config.maskHeaders),
          requestBody: maskBodyFields(reqBody, config.maskBodyFields),
          status: 0,
          responseHeaders: {},
          responseBody: null,
          duration: Date.now() - startTime,
          timestamp: startTime,
          error: 'Timeout',
        }

        if (!passesSample(config.sampleRate)) return
        if (config.shouldCapture && !config.shouldCapture(ctx)) return
        onError(ctx)
      })

      native.send(body ?? null)
    }

    // Forward all remaining XHR members from prototype
    for (const key of Object.getOwnPropertyNames(OriginalXHR.prototype)) {
      if (['open', 'send', 'setRequestHeader', 'constructor'].includes(key)) continue
      const desc = Object.getOwnPropertyDescriptor(OriginalXHR.prototype, key)
      if (!desc) continue

      if (typeof desc.value === 'function') {
        Object.defineProperty(this, key, {
          value: function (...args: unknown[]) {
            return (native as unknown as Record<string, (...a: unknown[]) => unknown>)[key]!(...args)
          },
          writable: true,
          configurable: true,
        })
      } else {
        // accessor (get/set) — define only the sides that exist
        const accessorDesc: PropertyDescriptor = { configurable: true }
        if (desc.get) accessorDesc.get = () => Reflect.get(native, key)
        if (desc.set) accessorDesc.set = (v: unknown) => Reflect.set(native, key, v)
        Object.defineProperty(this, key, accessorDesc)
      }
    }
  }

  // Preserve instanceof checks: share the prototype chain
  PatchedXHR.prototype = OriginalXHR.prototype
  Object.defineProperty(PatchedXHR, 'UNSENT',            { value: 0, configurable: true })
  Object.defineProperty(PatchedXHR, 'OPENED',            { value: 1, configurable: true })
  Object.defineProperty(PatchedXHR, 'HEADERS_RECEIVED',  { value: 2, configurable: true })
  Object.defineProperty(PatchedXHR, 'LOADING',           { value: 3, configurable: true })
  Object.defineProperty(PatchedXHR, 'DONE',              { value: 4, configurable: true })

  window.XMLHttpRequest = PatchedXHR as unknown as typeof XMLHttpRequest

  return function restore() {
    window.XMLHttpRequest = OriginalXHR
  }
}

function parseRawHeaders(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.trim().split('\r\n')) {
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim().toLowerCase()
    const value = line.slice(idx + 1).trim()
    result[key] = value
  }
  return result
}
