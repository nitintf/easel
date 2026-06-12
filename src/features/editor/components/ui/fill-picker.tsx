import { useCallback, useMemo, useRef, useState } from 'react'

import { HsvColorArea } from './hsv-color-area'
import { ScrubInput } from './scrub-input'

import type { Color, Fill, GradientTransform } from '@easel/editor-core'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'


type FillCategory = 'SOLID' | 'GRADIENT' | 'IMAGE'
type GradientSubtype =
  | 'GRADIENT_LINEAR'
  | 'GRADIENT_RADIAL'
  | 'GRADIENT_ANGULAR'
  | 'GRADIENT_DIAMOND'

const GRADIENT_SUBTYPES: { type: GradientSubtype; label: string }[] = [
  { type: 'GRADIENT_LINEAR', label: 'Linear' },
  { type: 'GRADIENT_RADIAL', label: 'Radial' },
  { type: 'GRADIENT_ANGULAR', label: 'Angular' },
  { type: 'GRADIENT_DIAMOND', label: 'Diamond' },
]

const DEFAULT_GRADIENT_TRANSFORMS: Record<GradientSubtype, GradientTransform> = {
  GRADIENT_LINEAR: { m00: 1, m01: 0, m02: 0, m10: 0, m11: 0, m12: 0.5 },
  GRADIENT_RADIAL: { m00: 0.5, m01: 0, m02: 0.5, m10: 0, m11: 0.5, m12: 0.5 },
  GRADIENT_ANGULAR: { m00: 0.5, m01: 0, m02: 0.5, m10: 0, m11: 0.5, m12: 0.5 },
  GRADIENT_DIAMOND: { m00: 0.5, m01: 0, m02: 0.5, m10: 0, m11: 0.5, m12: 0.5 },
}

function colorToRgba(c: Color): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`
}

interface FillPickerProps {
  fill: Fill
  onUpdate: (fill: Fill) => void
}

export function FillPicker({ fill, onUpdate }: FillPickerProps) {
  const [activeStopIndex, setActiveStopIndex] = useState(0)
  const stopBarRef = useRef<HTMLDivElement>(null)
  const draggingStopRef = useRef<number | null>(null)

  const fillCategory: FillCategory = useMemo(() => {
    if (fill.type.startsWith('GRADIENT')) return 'GRADIENT'
    if (fill.type === 'IMAGE') return 'IMAGE'
    return 'SOLID'
  }, [fill.type])

  const isGradient = fillCategory === 'GRADIENT'
  const gradientSubtype = isGradient ? (fill.type as GradientSubtype) : 'GRADIENT_LINEAR'

  const activeColor = useMemo(() => {
    if (isGradient && fill.gradientStops?.length) {
      const idx = Math.min(activeStopIndex, fill.gradientStops.length - 1)
      return fill.gradientStops[idx].color
    }
    return fill.color
  }, [fill, isGradient, activeStopIndex])

  const onColorUpdate = useCallback(
    (color: Color) => {
      if (isGradient && fill.gradientStops?.length) {
        const stops = [...fill.gradientStops]
        const idx = Math.min(activeStopIndex, stops.length - 1)
        stops[idx] = { ...stops[idx], color }
        onUpdate({ ...fill, gradientStops: stops })
      } else {
        onUpdate({ ...fill, color })
      }
    },
    [fill, isGradient, activeStopIndex, onUpdate],
  )

  const setCategory = useCallback(
    (cat: FillCategory) => {
      if (cat === fillCategory) return
      if (cat === 'SOLID') {
        const color = fill.gradientStops?.length
          ? { ...fill.gradientStops[0].color }
          : fill.color
        onUpdate({ ...fill, type: 'SOLID', color })
      } else if (cat === 'GRADIENT') {
        const type: GradientSubtype = 'GRADIENT_LINEAR'
        const stops = fill.gradientStops?.length
          ? fill.gradientStops
          : [
              { color: { ...fill.color }, position: 0 },
              { color: { r: 1, g: 1, b: 1, a: 1 }, position: 1 },
            ]
        onUpdate({
          ...fill,
          type,
          gradientStops: stops,
          gradientTransform: DEFAULT_GRADIENT_TRANSFORMS[type],
        })
        setActiveStopIndex(0)
      } else {
        onUpdate({ ...fill, type: 'IMAGE' })
      }
    },
    [fill, fillCategory, onUpdate],
  )

  const addStop = useCallback(() => {
    if (!fill.gradientStops) return
    const stops = [...fill.gradientStops]
    const newPos =
      stops.length >= 2
        ? (stops[stops.length - 2].position + stops[stops.length - 1].position) / 2
        : 0.5
    stops.push({ color: { ...activeColor }, position: newPos })
    stops.sort((a, b) => a.position - b.position)
    const newIndex = stops.findIndex((s) => s.position === newPos)
    setActiveStopIndex(newIndex)
    onUpdate({ ...fill, gradientStops: stops })
  }, [fill, activeColor, onUpdate])

  const removeStop = useCallback(
    (index: number) => {
      if (!fill.gradientStops || fill.gradientStops.length <= 2) return
      const stops = fill.gradientStops.filter((_, i) => i !== index)
      setActiveStopIndex(Math.min(activeStopIndex, stops.length - 1))
      onUpdate({ ...fill, gradientStops: stops })
    },
    [fill, activeStopIndex, onUpdate],
  )

  const swatchBackground = useMemo(() => {
    if (isGradient && fill.gradientStops?.length) {
      const stops = fill.gradientStops
        .map((s) => `${colorToRgba(s.color)} ${s.position * 100}%`)
        .join(', ')
      return `linear-gradient(to right, ${stops})`
    }
    return colorToRgba(fill.color)
  }, [fill, isGradient])

  const gradientBarBackground = useMemo(() => {
    if (!fill.gradientStops?.length) return ''
    return `linear-gradient(to right, ${fill.gradientStops
      .map((s) => `${colorToRgba(s.color)} ${s.position * 100}%`)
      .join(', ')})`
  }, [fill.gradientStops])

  const onStopBarPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const el = stopBarRef.current
      if (!el || draggingStopRef.current === null || !el.hasPointerCapture(e.pointerId)) return
      const rect = el.getBoundingClientRect()
      const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const stops = [...(fill.gradientStops ?? [])]
      stops[draggingStopRef.current] = { ...stops[draggingStopRef.current], position: pos }
      onUpdate({ ...fill, gradientStops: stops })
    },
    [fill, onUpdate],
  )

  const onStopPointerDown = useCallback(
    (index: number, e: React.PointerEvent) => {
      e.stopPropagation()
      setActiveStopIndex(index)
      draggingStopRef.current = index
      stopBarRef.current?.setPointerCapture(e.pointerId)
    },
    [],
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="size-5 shrink-0 cursor-pointer rounded border border-[#333] p-0"
          style={{ background: swatchBackground }}
        />
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-60 rounded-lg border border-[#333] bg-[#252525] p-2 shadow-xl"
        side="left"
        sideOffset={4}
      >
        {/* Fill category tabs */}
        <div className="mb-2 flex items-center gap-0.5">
          {(['SOLID', 'GRADIENT', 'IMAGE'] as FillCategory[]).map((cat) => (
            <button
              key={cat}
              className={`flex size-6 cursor-pointer items-center justify-center rounded border-none p-0 transition-colors hover:bg-[#3a3a3a] hover:text-[#ccc] ${
                fillCategory === cat ? 'bg-[#3a3a3a] text-[#ccc]' : 'text-[#666]'
              }`}
              title={cat.charAt(0) + cat.slice(1).toLowerCase()}
              onClick={() => setCategory(cat)}
            >
              {cat === 'SOLID' && (
                <svg className="size-3.5" viewBox="0 0 16 16">
                  <rect fill="currentColor" height="12" rx="2" width="12" x="2" y="2" />
                </svg>
              )}
              {cat === 'GRADIENT' && (
                <svg className="size-3.5" viewBox="0 0 16 16">
                  <defs>
                    <linearGradient id="gl">
                      <stop offset="0" stopColor="currentColor" />
                      <stop offset="1" stopColor="currentColor" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect fill="url(#gl)" height="12" rx="2" width="12" x="2" y="2" />
                </svg>
              )}
              {cat === 'IMAGE' && <span className="text-xs">🖼</span>}
            </button>
          ))}
        </div>

        {/* Gradient subtype dropdown */}
        {isGradient && (
          <div className="mb-2">
            <Select
              value={gradientSubtype}
              onValueChange={(v) => {
                const subtype = v as GradientSubtype
                if (subtype === fill.type) return
                onUpdate({
                  ...fill,
                  type: subtype,
                  gradientTransform: DEFAULT_GRADIENT_TRANSFORMS[subtype],
                })
              }}
            >
              <SelectTrigger className="h-7 w-28 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GRADIENT_SUBTYPES.map((sub) => (
                  <SelectItem key={sub.type} value={sub.type}>
                    {sub.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Gradient stop bar */}
        {isGradient && fill.gradientStops && fill.gradientStops.length > 0 && (
          <div
            ref={stopBarRef}
            className="relative mb-2 h-6 rounded"
            style={{ background: gradientBarBackground }}
            onPointerMove={onStopBarPointerMove}
            onPointerUp={() => { draggingStopRef.current = null }}
          >
            {fill.gradientStops.map((stop, idx) => (
              <div
                key={idx}
                className={`absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-sm shadow-sm ${
                  idx === activeStopIndex ? 'border-2 border-white' : 'border-2 border-white/60'
                }`}
                style={{
                  left: `${stop.position * 100}%`,
                  background: colorToRgba(stop.color),
                }}
                onPointerDown={(e) => onStopPointerDown(idx, e)}
              />
            ))}
          </div>
        )}

        {/* Gradient stops list */}
        {isGradient && fill.gradientStops && fill.gradientStops.length > 0 && (
          <div className="mb-2">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-[#666]">Stops</span>
              <button
                className="flex size-4 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-[#666] hover:text-[#ccc]"
                title="Add stop"
                onClick={addStop}
              >
                +
              </button>
            </div>
            {fill.gradientStops.map((stop, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-1 py-0.5 ${idx === activeStopIndex ? 'rounded bg-[#333]/50' : ''}`}
                onClick={() => setActiveStopIndex(idx)}
              >
                <ScrubInput
                  className="w-11"
                  max={100}
                  min={0}
                  suffix="%"
                  value={Math.round(stop.position * 100)}
                  onChange={(v) => {
                    const stops = [...(fill.gradientStops ?? [])]
                    stops[idx] = { ...stops[idx], position: v / 100 }
                    onUpdate({ ...fill, gradientStops: stops })
                  }}
                />
                <button
                  className="size-4 shrink-0 cursor-pointer rounded border border-[#333] p-0"
                  style={{ background: colorToRgba(stop.color) }}
                  onClick={(e) => { e.stopPropagation(); setActiveStopIndex(idx) }}
                />
                {(fill.gradientStops?.length ?? 0) > 2 && (
                  <button
                    className="flex size-4 cursor-pointer items-center justify-center rounded border-none bg-transparent p-0 text-[#666] hover:text-[#ccc]"
                    onClick={(e) => { e.stopPropagation(); removeStop(idx) }}
                  >
                    -
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Image placeholder */}
        {fill.type === 'IMAGE' && (
          <div className="flex h-24 items-center justify-center rounded border border-dashed border-[#333] text-xs text-[#666]">
            Image fill (coming soon)
          </div>
        )}

        {/* HSV color area */}
        {fill.type !== 'IMAGE' && <HsvColorArea color={activeColor} onUpdate={onColorUpdate} />}
      </PopoverContent>
    </Popover>
  )
}
