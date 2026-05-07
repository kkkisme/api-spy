import { isIgnoredUrl, passesSample, shouldTrigger } from '../config.js'
import { maskBodyFields, maskHeaders, truncate } from '../sanitize.js'
import type { ResolvedConfig, RequestContext } from '../types.js'
import { nanoid } from '../utils/id.js'

type ErrorHandler = (ctx: RequestContext) => void

// Points to the un-patched fetch; updated on each patchFetch() call so the
// transport module always uses the true original reference.
export let originalFetch: typeof fetch = window.fetch.bind(window)

export function patchFetch(config: ResolvedConfig, onError: ErrorHandler): () => void {
  // Capture current window.fetch at call time (supports test mocking)
  const native = window.fetch.bind(window)
  originalFetch = native

  window.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = resolveUrl(input)
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()
    const startTime = Date.now()

    if (isIgnoredUrl(url, config.ignoreUrls) || !config.enabled) {
      return native(input, init)
    }

    const reqHeaders = resolveHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    )
    const reqBody = await resolveBody(init?.body ?? (input instanceof Request ? input.body : null))

    let response: Response
    let networkError: string | undefined

    try {
      response = await native(input, init)
    } catch (err) {
      networkError = err instanceof Error ? err.message : String(err)
      const duration = Date.now() - startTime

      const ctx: RequestContext = {
        id: nanoid(),
        type: 'fetch',
        method,
        url,
        requestHeaders: maskHeaders(reqHeaders, config.maskHeaders),
        requestBody: maskBodyFields(truncate(reqBody, config.maxBodyLength), config.maskBodyFields),
        status: 0,
        responseHeaders: {},
        responseBody: null,
        duration,
        timestamp: startTime,
        error: networkError,
      }

      if (passesSample(config.sampleRate)) {
        if (!config.shouldCapture || config.shouldCapture(ctx)) {
          onError(ctx)
        }
      }

      throw err
    }

    const duration = Date.now() - startTime
    const status = response.status

    if (!shouldTrigger(status, duration, undefined, config)) {
      return response
    }

    if (!passesSample(config.sampleRate)) return response

    // clone to read body without consuming the original stream
    const cloned = response.clone()
    const respHeaders = responseHeadersToRecord(response.headers)
    let respBody: string | null = null

    try {
      const text = await cloned.text()
      respBody = truncate(
        maskBodyFields(text, config.maskBodyFields),
        config.maxBodyLength,
      )
    } catch {
      // ignore — body read failure is non-critical
    }

    const ctx: RequestContext = {
      id: nanoid(),
      type: 'fetch',
      method,
      url,
      requestHeaders: maskHeaders(reqHeaders, config.maskHeaders),
      requestBody: maskBodyFields(truncate(reqBody, config.maxBodyLength), config.maskBodyFields),
      status,
      responseHeaders: maskHeaders(respHeaders, config.maskHeaders),
      responseBody: respBody,
      duration,
      timestamp: startTime,
    }

    if (!config.shouldCapture || config.shouldCapture(ctx)) {
      onError(ctx)
    }

    return response
  }

  return function restore() {
    window.fetch = native
    originalFetch = native
  }
}

function resolveUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function resolveHeaders(
  headers: HeadersInit | Headers | undefined,
): Record<string, string> {
  const result: Record<string, string> = {}
  if (!headers) return result
  if (headers instanceof Headers) {
    headers.forEach((v, k) => { result[k] = v })
  } else if (Array.isArray(headers)) {
    for (const [k, v] of headers) { result[k] = v }
  } else {
    Object.assign(result, headers)
  }
  return result
}

async function resolveBody(
  body: BodyInit | ReadableStream | null | undefined,
): Promise<string | null> {
  if (body == null) return null
  if (typeof body === 'string') return body
  if (body instanceof URLSearchParams) return body.toString()
  if (body instanceof FormData) return '[FormData]'
  if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) return '[Binary]'
  if (body instanceof Blob) return `[Blob size=${body.size}]`
  if (body instanceof ReadableStream) return '[ReadableStream]'
  return String(body)
}

function responseHeadersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {}
  headers.forEach((v, k) => { result[k] = v })
  return result
}
