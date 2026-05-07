import type { RequestContext } from '../../types.js'

/**
 * @zumer/snapdom adapter.
 * Dynamically imported so it doesn't inflate the core bundle.
 * Returns a PNG DataURL, or null when snapdom is unavailable or capture fails.
 */
export async function snapdomCapture(_ctx: RequestContext): Promise<string | null> {
  try {
    const { snapdom } = await import('@zumer/snapdom')

    const result = await snapdom(document.documentElement, {
      // Exclude tainted / cross-origin canvas elements — per product decision
      filter: (el: Element) => {
        if (el.tagName !== 'CANVAS') return true
        try {
          const ctx2d = (el as HTMLCanvasElement).getContext('2d')
          if (ctx2d) ctx2d.getImageData(0, 0, 1, 1)
          return true
        } catch {
          return false // tainted canvas — skip
        }
      },
    })

    if (!result?.url) return null

    // result.url is the canonical SVG data URL; convert to PNG via canvas
    const img = await loadImage(result.url)
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth || window.innerWidth
    canvas.height = img.naturalHeight || window.innerHeight
    const ctx2d = canvas.getContext('2d')
    if (!ctx2d) return result.url // fallback: return SVG data URL as-is
    ctx2d.drawImage(img, 0, 0)
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
