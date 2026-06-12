import { useCallback, useMemo, useState } from 'react'

import { HsvColorArea } from './hsv-color-area'

import type { Color } from '@easel/editor-core'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'


interface ColorInputProps {
  color: Color
  editable?: boolean
  onUpdate: (color: Color) => void
}

function colorToHex(c: Color): string {
  const r = Math.round(c.r * 255).toString(16).padStart(2, '0')
  const g = Math.round(c.g * 255).toString(16).padStart(2, '0')
  const b = Math.round(c.b * 255).toString(16).padStart(2, '0')
  return `${r}${g}${b}`
}

function parseHex(hex: string): Color | null {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return null
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null
  return { r: r / 255, g: g / 255, b: b / 255, a: 1 }
}

function colorToRgba(c: Color): string {
  return `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${c.a})`
}

export function ColorInput({ color, editable = false, onUpdate }: ColorInputProps) {
  const [open, setOpen] = useState(false)
  const hex = useMemo(() => colorToHex(color), [color])
  const bgColor = useMemo(() => colorToRgba(color), [color])

  const onHexChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const parsed = parseHex(e.target.value)
      if (parsed) {
        onUpdate({ ...parsed, a: color.a })
      }
    },
    [color.a, onUpdate],
  )

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="size-5 shrink-0 cursor-pointer rounded border border-[#333] p-0"
            style={{ background: bgColor }}
          />
        </PopoverTrigger>
        <PopoverContent
          className="z-[100] w-60 rounded-lg border border-[#333] bg-[#252525] p-2 shadow-xl"
          side="left"
          sideOffset={4}
        >
          <HsvColorArea color={color} onUpdate={onUpdate} />
        </PopoverContent>
      </Popover>
      {editable ? (
        <input
          key={hex}
          className="min-w-0 flex-1 border-none bg-transparent font-mono text-xs text-[#ccc] outline-none"
          defaultValue={hex}
          maxLength={6}
          onChange={onHexChange}
        />
      ) : (
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[#666]">{hex}</span>
      )}
    </div>
  )
}
