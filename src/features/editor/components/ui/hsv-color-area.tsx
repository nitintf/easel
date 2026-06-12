import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Color } from '@easel/editor-core'

interface HsvColorAreaProps {
  color: Color
  onUpdate: (color: Color) => void
}

function rgbToHsv(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b)
  const mn = Math.min(r, g, b)
  const d = mx - mn
  let h = 0
  const s = mx === 0 ? 0 : d / mx
  const v = mx
  if (d !== 0) {
    if (mx === r) h = ((g - b) / d + 6) % 6
    else if (mx === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s: s * 100, v: v * 100 }
}

function hsvToRgb(h: number, s: number, v: number) {
  s /= 100
  v /= 100
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: r + m, g: g + m, b: b + m }
}

function colorToHex(c: Color): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0')
  return `${r}${g}${b}`
}

function parseHexColor(hex: string): Color | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 }
}

export function HsvColorArea({ color, onUpdate }: HsvColorAreaProps) {
  const [hue, setHue] = useState(0)
  const [saturation, setSaturation] = useState(100)
  const [brightness, setBrightness] = useState(100)
  const [alpha, setAlpha] = useState(1)
  const svAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const hsv = rgbToHsv(color.r, color.g, color.b)
    setHue(hsv.h)
    setSaturation(hsv.s)
    setBrightness(hsv.v)
    setAlpha(color.a)
  }, [color.r, color.g, color.b, color.a])

  const emitColor = useCallback(
    (h: number, s: number, v: number, a: number) => {
      const rgb = hsvToRgb(h, s, v)
      onUpdate({ r: rgb.r, g: rgb.g, b: rgb.b, a })
    },
    [onUpdate],
  )

  const hexValue = useMemo(() => colorToHex(color), [color])

  const hueColor = useMemo(() => {
    const rgb = hsvToRgb(hue, 100, 100)
    return `rgb(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)})`
  }, [hue])

  const onSvPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const el = svAreaRef.current
      if (!el) return
      el.setPointerCapture(e.pointerId)
      const rect = el.getBoundingClientRect()
      const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      const v = Math.max(0, Math.min(100, 100 - ((e.clientY - rect.top) / rect.height) * 100))
      setSaturation(s)
      setBrightness(v)
      emitColor(hue, s, v, alpha)
    },
    [hue, alpha, emitColor],
  )

  const onSvPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const el = svAreaRef.current
      if (!el?.hasPointerCapture(e.pointerId)) return
      const rect = el.getBoundingClientRect()
      const s = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100))
      const v = Math.max(0, Math.min(100, 100 - ((e.clientY - rect.top) / rect.height) * 100))
      setSaturation(s)
      setBrightness(v)
      emitColor(hue, s, v, alpha)
    },
    [hue, alpha, emitColor],
  )

  const onHueInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const h = +e.target.value
      setHue(h)
      emitColor(h, saturation, brightness, alpha)
    },
    [saturation, brightness, alpha, emitColor],
  )

  const onAlphaSliderInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const a = +e.target.value / 100
      setAlpha(a)
      emitColor(hue, saturation, brightness, a)
    },
    [hue, saturation, brightness, emitColor],
  )

  const onHexInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseHexColor(e.target.value)
      if (parsed) {
        onUpdate({ ...parsed, a: alpha })
      }
    },
    [alpha, onUpdate],
  )

  const onAlphaNumberInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const a = Math.max(0, Math.min(1, +e.target.value / 100))
      setAlpha(a)
      emitColor(hue, saturation, brightness, a)
    },
    [hue, saturation, brightness, emitColor],
  )

  return (
    <>
      {/* SV area */}
      <div
        ref={svAreaRef}
        className="relative h-[140px] w-full cursor-crosshair overflow-hidden rounded"
        style={{ background: hueColor }}
        onPointerDown={onSvPointerDown}
        onPointerMove={onSvPointerMove}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-white to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black to-transparent" />
        <div
          className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm"
          style={{ left: `${saturation}%`, top: `${100 - brightness}%` }}
        />
      </div>

      {/* Hue slider */}
      <div className="mt-2">
        <input
          className="hue-slider w-full h-3 appearance-none rounded-md outline-none"
          max={360}
          min={0}
          style={{
            background:
              'linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)',
          }}
          type="range"
          value={hue}
          onChange={onHueInput}
        />
      </div>

      {/* Alpha slider */}
      <div className="relative mt-2 h-3 rounded-md overflow-hidden" style={{
        backgroundImage:
          'linear-gradient(45deg, #444 25%, transparent 25%), linear-gradient(-45deg, #444 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #444 75%), linear-gradient(-45deg, transparent 75%, #444 75%)',
        backgroundSize: '8px 8px',
        backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0',
        backgroundColor: '#333',
      }}>
        <div
          className="absolute inset-0 rounded-md"
          style={{ background: `linear-gradient(to right, transparent, ${hueColor})` }}
        />
        <input
          className="alpha-slider absolute inset-0 w-full h-3 appearance-none bg-transparent outline-none"
          max={100}
          min={0}
          type="range"
          value={alpha * 100}
          onChange={onAlphaSliderInput}
        />
      </div>

      {/* Hex input */}
      <div className="mt-2 flex items-center gap-1">
        <span className="text-[11px] text-[#666]">#</span>
        <input
          key={hexValue}
          className="min-w-0 flex-1 rounded border border-[#333] bg-[#2a2a2a] px-1.5 py-0.5 font-mono text-xs text-[#ccc]"
          defaultValue={hexValue}
          maxLength={6}
          type="text"
          onChange={onHexInput}
        />
        <input
          className="w-10 rounded border border-[#333] bg-[#2a2a2a] px-1 py-0.5 text-right text-xs text-[#ccc] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          max={100}
          min={0}
          type="number"
          value={Math.round(alpha * 100)}
          onChange={onAlphaNumberInput}
        />
        <span className="text-[11px] text-[#666]">%</span>
      </div>

      <style>{`
        .hue-slider::-webkit-slider-thumb,
        .alpha-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: white;
          border: 2px solid white;
          box-shadow: 0 0 2px rgba(0, 0, 0, 0.5);
          cursor: pointer;
        }
      `}</style>
    </>
  )
}
