import type { CanvasKit, TypefaceFontProvider } from 'canvaskit-wasm'

export interface FontInfo {
  family: string
  fullName: string
  style: string
  postscriptName: string
}

const loadedFamilies = new Map<string, ArrayBuffer>()
let fontProvider: TypefaceFontProvider | null = null

export function initFontService(_canvasKit: CanvasKit, provider: TypefaceFontProvider) {
  fontProvider = provider
}

export function getFontProvider(): TypefaceFontProvider | null {
  return fontProvider
}

export async function queryFonts(): Promise<FontInfo[]> {
  if (typeof window === 'undefined' || !window.queryLocalFonts) return []
  try {
    const fonts = await window.queryLocalFonts()
    const seen = new Set<string>()
    const result: FontInfo[] = []
    for (const f of fonts) {
      const key = `${f.family}|${f.style}`
      if (seen.has(key)) continue
      seen.add(key)
      result.push({
        family: f.family,
        fullName: f.fullName,
        style: f.style,
        postscriptName: f.postscriptName
      })
    }
    return result
  } catch {
    return []
  }
}

export async function listFamilies(): Promise<string[]> {
  const fonts = await queryFonts()
  return [...new Set(fonts.map((f) => f.family))].sort()
}

const BUNDLED_FONTS: Record<string, string> = {
  'Inter|Regular': '/Inter-Regular.ttf'
}

export async function loadFont(family: string, style = 'Regular'): Promise<ArrayBuffer | null> {
  const cacheKey = `${family}|${style}`
  if (loadedFamilies.has(cacheKey)) {
    const cached = loadedFamilies.get(cacheKey)
    if (!cached) return null
    registerFontInCanvasKit(family, cached)
    return cached
  }

  // Try local font access API first (browser only)
  if (typeof window !== 'undefined' && window.queryLocalFonts) {
    try {
      const fonts = await window.queryLocalFonts()
      const match =
        fonts.find((f: FontInfo) => f.family === family && f.style === style) ??
        fonts.find((f: FontInfo) => f.family === family)
      if (match) {
        const blob: Blob = await match.blob()
        const buffer = await blob.arrayBuffer()

        loadedFamilies.set(cacheKey, buffer)
        registerFontInCanvasKit(family, buffer)
        registerFontInBrowser(family, style, buffer)
        return buffer
      }
    } catch {
      /* fall through to bundled */
    }
  }

  // Fall back to bundled font
  const bundledUrl = BUNDLED_FONTS[cacheKey]
  if (bundledUrl) {
    try {
      const response = await fetch(bundledUrl)
      const buffer = await response.arrayBuffer()

      loadedFamilies.set(cacheKey, buffer)
      registerFontInCanvasKit(family, buffer)
      registerFontInBrowser(family, style, buffer)
      return buffer
    } catch {
      /* no bundled font available */
    }
  }

  return null
}

function registerFontInCanvasKit(family: string, data: ArrayBuffer) {
  if (!fontProvider) return
  fontProvider.registerFont(data, family)
}

function registerFontInBrowser(family: string, style: string, data: ArrayBuffer) {
  if (typeof document === 'undefined') return
  const weight = styleToWeight(style)
  const italic = style.toLowerCase().includes('italic') ? 'italic' : 'normal'
  const face = new FontFace(family, data, {
    weight: String(weight),
    style: italic
  })
  face.load().then(() => document.fonts.add(face))
}

export function styleToWeight(style: string): number {
  const s = style.toLowerCase().replace(/[\s-_]/g, '')
  if (s.includes('thin') || s.includes('hairline')) return 100
  if (s.includes('extralight') || s.includes('ultralight')) return 200
  if (s.includes('light')) return 300
  if (s.includes('medium')) return 500
  if (s.includes('semibold') || s.includes('demibold')) return 600
  if (s.includes('extrabold') || s.includes('ultrabold')) return 800
  if (s.includes('black') || s.includes('heavy')) return 900
  if (s.includes('bold')) return 700
  return 400
}

export async function ensureNodeFont(family: string, weight: number): Promise<void> {
  const style = weightToStyle(weight)
  await loadFont(family, style)
}

export function isFontLoaded(family: string): boolean {
  return [...loadedFamilies.keys()].some((k) => k.startsWith(`${family}|`))
}

export function weightToStyle(weight: number, italic = false): string {
  let label = 'Regular'
  if (weight <= 100) label = 'Thin'
  else if (weight <= 200) label = 'ExtraLight'
  else if (weight <= 300) label = 'Light'
  else if (weight <= 500) label = 'Medium'
  else if (weight <= 600) label = 'SemiBold'
  else if (weight <= 700) label = 'Bold'
  else if (weight <= 800) label = 'ExtraBold'
  else if (weight >= 900) label = 'Black'
  if (italic) label += ' Italic'
  return label
}
