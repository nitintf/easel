import { Minus, Plus } from 'lucide-react'

import { useEditorStore } from '../store/editor-store'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export function ZoomControl() {
  const zoom = useEditorStore((s) => s.zoom)
  const actions = useEditorStore((s) => s.actions)

  function zoomIn() {
    // Zoom towards center of canvas area
    const el = document.querySelector('canvas')
    if (!el) return
    const rect = el.getBoundingClientRect()
    actions.applyZoom(-2, rect.width / 2, rect.height / 2)
  }

  function zoomOut() {
    const el = document.querySelector('canvas')
    if (!el) return
    const rect = el.getBoundingClientRect()
    actions.applyZoom(2, rect.width / 2, rect.height / 2)
  }

  function resetZoom() {
    actions.zoomToFit()
  }

  return (
    <div className="absolute right-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg border border-[#333] bg-[#252525]/95 px-0.5 py-0.5 shadow-lg backdrop-blur-sm">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[#888] transition-colors hover:bg-[#3a3a3a] hover:text-[#ccc]"
            onClick={zoomOut}
          >
            <Minus className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          Zoom out
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex h-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent px-1.5 font-mono text-[11px] tabular-nums text-[#888] transition-colors hover:bg-[#3a3a3a] hover:text-[#ccc]"
            onClick={resetZoom}
          >
            {Math.round(zoom * 100)}%
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          Zoom to fit
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className="flex size-6 cursor-pointer items-center justify-center rounded-md border-none bg-transparent text-[#888] transition-colors hover:bg-[#3a3a3a] hover:text-[#ccc]"
            onClick={zoomIn}
          >
            <Plus className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={4}>
          Zoom in
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
