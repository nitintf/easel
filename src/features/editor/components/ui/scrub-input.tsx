import { useCallback, useRef, useState } from 'react'

interface ScrubInputProps {
  value: number
  onChange: (value: number) => void
  onCommit?: (value: number, previous: number) => void
  min?: number
  max?: number
  step?: number
  sensitivity?: number
  icon?: React.ReactNode
  label?: string
  suffix?: string
  className?: string
}

export function ScrubInput({
  value,
  onChange,
  onCommit,
  min = -Infinity,
  max = Infinity,
  step = 1,
  sensitivity = 1,
  icon,
  label,
  suffix,
  className = '',
}: ScrubInputProps) {
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const displayValue = Math.round(value)

  const startScrub = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      const startX = e.clientX
      let lastX = startX
      let accumulated = value
      const valueBeforeScrub = value
      let hasMoved = false

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - lastX
        lastX = ev.clientX
        if (!hasMoved && Math.abs(ev.clientX - startX) > 2) {
          hasMoved = true
          document.body.style.cursor = 'ew-resize'
        }
        if (hasMoved) {
          accumulated += dx * step * sensitivity
          const clamped = Math.round(Math.min(max, Math.max(min, accumulated)))
          onChange(clamped)
        }
      }

      function onUp() {
        document.body.style.cursor = ''
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        if (hasMoved) {
          const finalValue = Math.round(Math.min(max, Math.max(min, accumulated)))
          if (finalValue !== valueBeforeScrub) {
            onCommit?.(finalValue, valueBeforeScrub)
          }
        } else {
          setEditing(true)
          requestAnimationFrame(() => {
            inputRef.current?.select()
          })
        }
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
    },
    [value, onChange, onCommit, min, max, step, sensitivity],
  )

  const commitEdit = useCallback(
    (e: React.FocusEvent<HTMLInputElement> | React.KeyboardEvent<HTMLInputElement>) => {
      const val = +(e.target as HTMLInputElement).value
      const previous = value
      if (!Number.isNaN(val)) {
        const clamped = Math.min(max, Math.max(min, val))
        onChange(clamped)
        if (clamped !== previous) {
          onCommit?.(clamped, previous)
        }
      }
      setEditing(false)
    },
    [value, onChange, onCommit, min, max],
  )

  const onKeydown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        commitEdit(e)
      } else if (e.key === 'Escape') {
        setEditing(false)
      }
    },
    [commitEdit],
  )

  return (
    <div
      className={`flex min-w-0 flex-1 items-center rounded border border-[#2a2a2a] bg-[#222] h-[22px] focus-within:border-[#a855f7] ${className}`}
      style={{ cursor: editing ? 'auto' : 'ew-resize' }}
      onPointerDown={editing ? undefined : startScrub}
    >
      <span className="flex shrink-0 select-none items-center justify-center self-stretch px-[5px] text-[#666] [&>*]:pointer-events-none">
        {icon}
        {label && <span className="text-[10px] leading-none">{label}</span>}
      </span>
      {editing ? (
        <input
          ref={inputRef}
          autoFocus
          className="min-w-0 flex-1 cursor-text border-none bg-transparent pr-1.5 font-[inherit] text-[10px] text-[#ccc] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          defaultValue={displayValue}
          max={max === Infinity ? undefined : max}
          min={min === -Infinity ? undefined : min}
          step={step}
          type="number"
          onBlur={commitEdit}
          onKeyDown={onKeydown}
        />
      ) : (
        <span className="flex flex-1 select-none items-center truncate pr-1.5 text-[10px] overflow-hidden">
          <span className="flex-1 text-[#ccc]">{displayValue}</span>
          {suffix && <span className="shrink-0 text-[#666]">{suffix}</span>}
        </span>
      )}
    </div>
  )
}
