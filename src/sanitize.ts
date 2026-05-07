const DEFAULT_MASK_HEADERS = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'x-auth-token']
const MASKED = '[MASKED]'

export function maskHeaders(
  headers: Record<string, string>,
  maskList: string[],
): Record<string, string> {
  const lower = maskList.map((h) => h.toLowerCase())
  const result: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    result[k] = lower.includes(k.toLowerCase()) ? MASKED : v
  }
  return result
}

export function maskBodyFields(
  body: string | null,
  fields: string[],
): string | null {
  if (!body || fields.length === 0) return body
  try {
    const parsed: unknown = JSON.parse(body)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>
      const masked: Record<string, unknown> = { ...obj }
      for (const field of fields) {
        if (field in masked) masked[field] = MASKED
      }
      return JSON.stringify(masked)
    }
  } catch {
    // not JSON — return as-is
  }
  return body
}

export function truncate(value: string | null | undefined, maxBytes: number): string | null {
  if (value == null) return null
  if (value.length <= maxBytes) return value
  return value.slice(0, maxBytes) + `…[truncated ${value.length - maxBytes} chars]`
}

export function defaultMaskHeaders(): string[] {
  return [...DEFAULT_MASK_HEADERS]
}
