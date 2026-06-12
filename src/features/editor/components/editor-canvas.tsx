import { Loader2 } from 'lucide-react'
import { useRef, useMemo, useState, useEffect } from 'react'

import { useCanvas } from '../hooks/use-canvas'
import { useCanvasInput } from '../hooks/use-canvas-input'
import { useEditorStore } from '../store/editor-store'

import type { Tool } from '../types'

// Easel pointer cursor — clean filled triangle, no tail
const EASEL_CURSOR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="20" viewBox="0 0 18 20"><path d="M3 1L15 10L3 17Z" fill="white" stroke="white" stroke-width="2.5" stroke-linejoin="round"/><path d="M3 1L15 10L3 17Z" fill="black"/></svg>`
const EASEL_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(EASEL_CURSOR_SVG)}") 3 1, default`

const TOOL_CURSORS: Partial<Record<Tool, string>> = {
  SELECT: EASEL_CURSOR,
  HAND: 'grab',
  PEN: 'crosshair',
  TEXT: 'text',
  FRAME: 'crosshair',
  SECTION: 'crosshair',
  RECTANGLE: 'crosshair',
  ELLIPSE: 'crosshair',
  LINE: 'crosshair',
  POLYGON: 'crosshair',
  STAR: 'crosshair',
}

export function EditorCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loadError, setLoadError] = useState(false)

  const { hitTestSectionTitle, hitTestComponentLabel } = useCanvas(canvasRef)
  const { cursorRef } = useCanvasInput(
    canvasRef,
    hitTestSectionTitle,
    hitTestComponentLabel,
  )

  const activeTool = useEditorStore((s) => s.activeTool)

  // Timeout: if canvas isn't ready after 15s, show error
  useEffect(() => {
    const timer = setTimeout(() => {
      const canvas = canvasRef.current
      if (canvas && canvas.dataset.ready !== '1') {
        setLoadError(true)
      }
    }, 15000)
    return () => clearTimeout(timer)
  }, [])

  const cursor = useMemo(() => {
    return cursorRef.current ?? TOOL_CURSORS[activeTool] ?? EASEL_CURSOR
  }, [activeTool, cursorRef])

  return (
    <>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full outline-none"
        role="application"
        aria-label="Design canvas"
        style={{ cursor }}
      />
      {loadError && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#1a1a1a]">
          <p className="text-[13px] text-[#999]">Could not load the editor engine.</p>
          <p className="text-[11px] text-[#888]">Check your connection and try again.</p>
          <button
            className="mt-1 flex items-center gap-1.5 rounded-md bg-[#a855f7] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#9333ea]"
            onClick={() => {
              setLoadError(false)
              window.location.reload()
            }}
          >
            <Loader2 className="size-3.5" />
            Retry
          </button>
        </div>
      )}
    </>
  )
}
