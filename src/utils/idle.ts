type IdleCallback = () => void

/**
 * requestIdleCallback polyfill — falls back to setTimeout(fn, 1) in environments
 * that don't support it (Safari < 16, Node test env).
 */
export function scheduleIdle(cb: IdleCallback, timeout = 2000): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(cb, { timeout })
  } else {
    setTimeout(cb, 1)
  }
}
