import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearPersisted,
  dequeueAll,
  enqueue,
  loadPersisted,
  peek,
  persistFailed,
} from '../src/reporter/queue'
import type { ReportEvent } from '../src/types'

function makeEvent(id = 'test-id'): ReportEvent {
  return {
    sdkVersion: '0.1.0',
    appId: 'test',
    request: {
      id,
      type: 'fetch',
      method: 'GET',
      url: 'https://api.test/data',
      requestHeaders: {},
      requestBody: null,
      status: 500,
      responseHeaders: {},
      responseBody: null,
      duration: 120,
      timestamp: Date.now(),
    },
    page: {
      url: 'https://app.test/',
      title: 'Test',
      userAgent: 'vitest',
      viewport: { width: 1280, height: 720 },
      snapshot: null,
    },
  }
}

describe('in-memory queue', () => {
  beforeEach(() => {
    dequeueAll() // flush before each test
  })

  it('enqueues and peeks without consuming', () => {
    enqueue(makeEvent('a'))
    enqueue(makeEvent('b'))
    expect(peek()).toHaveLength(2)
    expect(peek()).toHaveLength(2) // peek is non-destructive
  })

  it('dequeueAll drains the queue', () => {
    enqueue(makeEvent('x'))
    const batch = dequeueAll()
    expect(batch).toHaveLength(1)
    expect(dequeueAll()).toHaveLength(0)
  })
})

describe('localStorage persistence', () => {
  beforeEach(() => {
    clearPersisted()
  })

  it('persists and loads events', () => {
    persistFailed([makeEvent('p1'), makeEvent('p2')])
    const loaded = loadPersisted()
    expect(loaded).toHaveLength(2)
    expect(loaded[0]?.request.id).toBe('p1')
  })

  it('returns empty array when nothing persisted', () => {
    expect(loadPersisted()).toEqual([])
  })

  it('clears persisted events', () => {
    persistFailed([makeEvent('c1')])
    clearPersisted()
    expect(loadPersisted()).toEqual([])
  })

  it('caps stored events at 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => makeEvent(`e${i}`))
    persistFailed(many)
    expect(loadPersisted().length).toBeLessThanOrEqual(20)
  })
})
