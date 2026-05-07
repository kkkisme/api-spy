import { describe, expect, it } from 'vitest'
import { isIgnoredUrl, passesSample, resolveConfig, shouldTrigger } from '../src/config'

describe('resolveConfig', () => {
  it('throws when endpoint is missing', () => {
    expect(() => resolveConfig({ endpoint: '' })).toThrow('[api-spy]')
  })

  it('auto-adds endpoint to ignoreUrls', () => {
    const cfg = resolveConfig({ endpoint: 'https://report.example.com/collect' })
    expect(cfg.ignoreUrls.some((u) => u === 'https://report.example.com/collect')).toBe(true)
  })

  it('merges user ignoreUrls with endpoint', () => {
    const cfg = resolveConfig({
      endpoint: 'https://report.example.com/collect',
      ignoreUrls: [/analytics/],
    })
    expect(cfg.ignoreUrls).toHaveLength(2)
  })

  it('uses location.hostname as default appId', () => {
    const cfg = resolveConfig({ endpoint: 'https://x.com/y' })
    // jsdom sets location.hostname to 'localhost'
    expect(typeof cfg.appId).toBe('string')
    expect(cfg.appId.length).toBeGreaterThan(0)
  })
})

describe('isIgnoredUrl', () => {
  it('matches string patterns by substring', () => {
    expect(isIgnoredUrl('https://report.example.com/collect', ['report.example.com'])).toBe(true)
  })

  it('matches RegExp patterns', () => {
    expect(isIgnoredUrl('https://analytics.example.com/', [/analytics/])).toBe(true)
  })

  it('returns false when no match', () => {
    expect(isIgnoredUrl('https://api.example.com/data', ['report.example.com'])).toBe(false)
  })
})

describe('shouldTrigger', () => {
  const cfg = resolveConfig({ endpoint: 'https://x.com' })

  it('triggers on network error (status 0)', () => {
    expect(shouldTrigger(0, 0, undefined, cfg)).toBe(true)
  })

  it('triggers on error status codes', () => {
    expect(shouldTrigger(500, 100, undefined, cfg)).toBe(true)
    expect(shouldTrigger(404, 100, undefined, cfg)).toBe(true)
  })

  it('does not trigger on success', () => {
    expect(shouldTrigger(200, 100, undefined, cfg)).toBe(false)
  })

  it('triggers when error string is present', () => {
    expect(shouldTrigger(0, 0, 'Network error', cfg)).toBe(true)
  })

  it('triggers on slow response when threshold set', () => {
    const slowCfg = resolveConfig({ endpoint: 'https://x.com', slowThreshold: 1000 })
    expect(shouldTrigger(200, 1500, undefined, slowCfg)).toBe(true)
    expect(shouldTrigger(200, 500, undefined, slowCfg)).toBe(false)
  })
})

describe('passesSample', () => {
  it('always passes at rate 1', () => {
    for (let i = 0; i < 20; i++) {
      expect(passesSample(1)).toBe(true)
    }
  })

  it('never passes at rate 0', () => {
    for (let i = 0; i < 20; i++) {
      expect(passesSample(0)).toBe(false)
    }
  })
})
