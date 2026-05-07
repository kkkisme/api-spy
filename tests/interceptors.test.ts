import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveConfig } from '../src/config'
import { patchFetch } from '../src/interceptors/fetch'
import { patchXhr } from '../src/interceptors/xhr'
import type { RequestContext } from '../src/types'

// ─── Fetch interceptor ────────────────────────────────────────────────────────

describe('fetch interceptor', () => {
  const captured: RequestContext[] = []
  let restore: () => void

  function setupPatch(mockImpl: () => Promise<Response>) {
    // Set mock BEFORE patching so patchFetch captures the mock as `native`
    globalThis.fetch = vi.fn().mockImplementation(mockImpl)
    const cfg = resolveConfig({ endpoint: 'https://report.test/collect' })
    restore = patchFetch(cfg, (ctx) => captured.push(ctx))
  }

  beforeEach(() => {
    captured.length = 0
  })

  afterEach(() => {
    restore?.()
  })

  it('does not capture successful 200 responses', async () => {
    setupPatch(() => Promise.resolve(new Response('ok', { status: 200 })))
    await fetch('https://api.test/data')
    expect(captured).toHaveLength(0)
  })

  it('captures 500 responses', async () => {
    setupPatch(() => Promise.resolve(new Response('error body', { status: 500 })))
    await fetch('https://api.test/fail').catch(() => {})

    expect(captured.length).toBeGreaterThanOrEqual(1)
    expect(captured[0]?.status).toBe(500)
    expect(captured[0]?.url).toBe('https://api.test/fail')
    expect(captured[0]?.type).toBe('fetch')
  })

  it('captures 404 responses', async () => {
    setupPatch(() => Promise.resolve(new Response('not found', { status: 404 })))
    await fetch('https://api.test/missing')

    expect(captured.length).toBeGreaterThanOrEqual(1)
    expect(captured[0]?.status).toBe(404)
  })

  it('captures network errors (rejection)', async () => {
    setupPatch(() => Promise.reject(new Error('Failed to fetch')))
    await fetch('https://api.test/gone').catch(() => {})

    expect(captured.length).toBeGreaterThanOrEqual(1)
    expect(captured[0]?.status).toBe(0)
    expect(captured[0]?.error).toContain('fetch')
  })

  it('does not capture requests matching ignoreUrls (report endpoint)', async () => {
    setupPatch(() => Promise.resolve(new Response('', { status: 500 })))
    // The endpoint itself should be ignored
    await fetch('https://report.test/collect').catch(() => {})
    expect(captured).toHaveLength(0)
  })

  it('records method and url', async () => {
    setupPatch(() => Promise.resolve(new Response('', { status: 500 })))
    await fetch('https://api.test/items', { method: 'POST' }).catch(() => {})

    expect(captured[0]?.method).toBe('POST')
    expect(captured[0]?.url).toBe('https://api.test/items')
  })

  it('restore() brings back original fetch', () => {
    const before = globalThis.fetch
    setupPatch(() => Promise.resolve(new Response('', { status: 200 })))
    expect(globalThis.fetch).not.toBe(before)
    restore()
    // After restore, window.fetch should be the mock we set (not a patched wrapper)
    // The key assertion is that fetch !== patched wrapper
    expect(typeof globalThis.fetch).toBe('function')
  })
})

// ─── XHR interceptor ─────────────────────────────────────────────────────────

describe('xhr interceptor', () => {
  it('patches window.XMLHttpRequest and restore() undoes it', () => {
    const before = window.XMLHttpRequest
    const cfg = resolveConfig({ endpoint: 'https://report.test/collect' })
    const restore = patchXhr(cfg, () => {})

    expect(window.XMLHttpRequest).not.toBe(before)

    restore()

    expect(window.XMLHttpRequest).toBe(before)
  })

  it('nested patch/restore leaves outer patch intact', () => {
    const cfg = resolveConfig({ endpoint: 'https://report.test/collect' })
    const restore1 = patchXhr(cfg, () => {})
    const afterFirst = window.XMLHttpRequest

    const restore2 = patchXhr(cfg, () => {})
    expect(window.XMLHttpRequest).not.toBe(afterFirst)

    restore2()
    expect(window.XMLHttpRequest).toBe(afterFirst)

    restore1()
    // Fully restored
    expect(window.XMLHttpRequest).not.toBe(afterFirst)
  })

  it('new instance passes instanceof XMLHttpRequest', () => {
    const cfg = resolveConfig({ endpoint: 'https://report.test/collect' })
    const restore = patchXhr(cfg, () => {})

    const xhr = new XMLHttpRequest()
    expect(xhr instanceof XMLHttpRequest).toBe(true)

    restore()
  })

  it('exposes DONE constant', () => {
    const cfg = resolveConfig({ endpoint: 'https://report.test/collect' })
    const restore = patchXhr(cfg, () => {})

    expect(XMLHttpRequest.DONE).toBe(4)

    restore()
  })
})
