import { describe, expect, it } from 'vitest'
import { maskBodyFields, maskHeaders, truncate } from '../src/sanitize'

describe('maskHeaders', () => {
  it('masks listed headers case-insensitively', () => {
    const result = maskHeaders(
      { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      ['authorization'],
    )
    expect(result['Authorization']).toBe('[MASKED]')
    expect(result['Content-Type']).toBe('application/json')
  })

  it('returns empty object unchanged', () => {
    expect(maskHeaders({}, ['authorization'])).toEqual({})
  })
})

describe('maskBodyFields', () => {
  it('masks specified JSON fields', () => {
    const body = JSON.stringify({ password: 'secret', user: 'alice' })
    const result = maskBodyFields(body, ['password'])
    const parsed = JSON.parse(result!)
    expect(parsed.password).toBe('[MASKED]')
    expect(parsed.user).toBe('alice')
  })

  it('returns non-JSON body unchanged', () => {
    const body = 'plain text'
    expect(maskBodyFields(body, ['password'])).toBe('plain text')
  })

  it('returns null when body is null', () => {
    expect(maskBodyFields(null, ['password'])).toBeNull()
  })

  it('no-ops when fields list is empty', () => {
    const body = JSON.stringify({ secret: 'val' })
    expect(maskBodyFields(body, [])).toBe(body)
  })
})

describe('truncate', () => {
  it('returns null for null input', () => {
    expect(truncate(null, 100)).toBeNull()
  })

  it('returns string unchanged when under limit', () => {
    expect(truncate('hello', 100)).toBe('hello')
  })

  it('truncates and appends note when over limit', () => {
    const result = truncate('abcdef', 3)
    expect(result).toMatch(/^abc/)
    expect(result).toContain('truncated')
  })
})
