import {
  MousePointer2,
  Frame,
  LayoutGrid,
  Square,
  Circle,
  Minus,
  Triangle,
  Star,
  PenTool,
  Type,
  Hand,
  Palette,
  MessageSquarePlus,
} from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { useEditorStore } from '../store/editor-store'
import { TOOLS } from '../types'

import { EditorThemeDialog } from './editor-theme-dialog'

import type { Tool, ToolDef } from '../types'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const TOOL_ICONS: Record<Tool, React.ComponentType<{ className?: string }>> = {
  SELECT: MousePointer2,
  FRAME: Frame,
  SECTION: LayoutGrid,
  RECTANGLE: Square,
  ELLIPSE: Circle,
  LINE: Minus,
  POLYGON: Triangle,
  STAR: Star,
  PEN: PenTool,
  TEXT: Type,
  HAND: Hand,
}

const TOOL_LABELS: Record<Tool, string> = {
  SELECT: 'Move',
  FRAME: 'Frame',
  SECTION: 'Section',
  RECTANGLE: 'Rectangle',
  ELLIPSE: 'Ellipse',
  LINE: 'Line',
  POLYGON: 'Polygon',
  STAR: 'Star',
  PEN: 'Pen',
  TEXT: 'Text',
  HAND: 'Hand',
}

const TOOL_SHORTCUT_LABELS: Record<Tool, string> = {
  SELECT: 'V',
  FRAME: 'F',
  SECTION: 'S',
  RECTANGLE: 'R',
  ELLIPSE: 'O',
  LINE: 'L',
  POLYGON: '',
  STAR: '',
  PEN: 'P',
  TEXT: 'T',
  HAND: 'H',
}

function isActive(toolDef: ToolDef, activeTool: Tool): boolean {
  if (toolDef.key === activeTool) return true
  return toolDef.flyout?.includes(activeTool) ?? false
}

function activeKeyForTool(toolDef: ToolDef, activeTool: Tool): Tool {
  if (toolDef.flyout?.includes(activeTool)) return activeTool
  return toolDef.key
}

/** Tiny triangle indicator for flyout tools — purely CSS */
function FlyoutIndicator({ active }: { active: boolean }) {
  return (
    <span
      className="absolute right-[3px] bottom-[3px]"
      style={{
        width: 0,
        height: 0,
        borderLeft: '3px solid transparent',
        borderTop: '3px solid transparent',
        borderRight: `3px solid ${active ? 'rgba(255,255,255,0.5)' : '#555'}`,
        borderBottom: `3px solid ${active ? 'rgba(255,255,255,0.5)' : '#555'}`,
      }}
    />
  )
}

export function EditorToolbar() {
  const activeTool = useEditorStore((s) => s.activeTool)
  const setTool = useEditorStore((s) => s.actions.setTool)
  const toggleAiChat = useEditorStore((s) => s.actions.toggleAiChat)

  const [showThemeDialog, setShowThemeDialog] = useState(false)
  const [flyoutOpen, setFlyoutOpen] = useState<string | null>(null)
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout>>(null)

  const handlePointerDown = useCallback(
    (toolDef: ToolDef) => {
      if (!toolDef.flyout || toolDef.flyout.length <= 1) return
      longPressTimerRef.current = setTimeout(() => {
        setFlyoutOpen(toolDef.key)
      }, 350)
    },
    [],
  )

  const handlePointerUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, toolDef: ToolDef) => {
      if (toolDef.flyout && toolDef.flyout.length > 1) {
        e.preventDefault()
        setFlyoutOpen(toolDef.key)
      }
    },
    [],
  )

  return (
    <>
      <div aria-label="Editor toolbar" className="flex items-center gap-0.5 rounded-xl border border-[#333] bg-[#252525]/95 px-1.5 py-1 shadow-lg backdrop-blur-sm" role="toolbar">
        {TOOLS.map((toolDef) => {
          const active = isActive(toolDef, activeTool)
          const activeKey = activeKeyForTool(toolDef, activeTool)
          const Icon = TOOL_ICONS[activeKey]
          const hasFlyout = toolDef.flyout && toolDef.flyout.length > 1

          if (hasFlyout) {
            return (
              <DropdownMenu
                key={toolDef.key}
                open={flyoutOpen === toolDef.key}
                onOpenChange={(open) => setFlyoutOpen(open ? toolDef.key : null)}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                      <button
                        aria-current={active ? 'true' : undefined}
                        className={`relative flex size-8 cursor-pointer items-center justify-center rounded-lg border-none transition-colors ${
                          active
                            ? 'bg-[#a855f7] text-white'
                            : 'bg-transparent text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]'
                        }`}
                        onClick={(e) => {
                          // Left click selects the tool; don't open flyout
                          if (flyoutOpen !== toolDef.key) {
                            e.preventDefault()
                            setTool(activeKey)
                          }
                        }}
                        onContextMenu={(e) => handleContextMenu(e, toolDef)}
                        onPointerDown={() => handlePointerDown(toolDef)}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                      >
                        <Icon className="size-4" />
                        <FlyoutIndicator active={active} />
                      </button>
                    </DropdownMenuTrigger>
                  </TooltipTrigger>
                  <TooltipContent side="top" sideOffset={8}>
                    {TOOL_LABELS[activeKey]}
                    {TOOL_SHORTCUT_LABELS[activeKey] && (
                      <kbd className="ml-1 text-[10px] opacity-60">{TOOL_SHORTCUT_LABELS[activeKey]}</kbd>
                    )}
                  </TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="start" side="top" sideOffset={8}>
                  {toolDef.flyout!.map((sub) => {
                    const SubIcon = TOOL_ICONS[sub]
                    return (
                      <DropdownMenuItem
                        key={sub}
                        className={`flex cursor-pointer items-center gap-2 text-xs ${
                          activeTool === sub ? 'bg-[#a855f7] text-white' : ''
                        }`}
                        onSelect={() => {
                          setTool(sub)
                          setFlyoutOpen(null)
                        }}
                      >
                        <SubIcon className="size-3.5" />
                        <span className="flex-1">{TOOL_LABELS[sub]}</span>
                        {TOOL_SHORTCUT_LABELS[sub] && (
                          <span className="text-[11px] text-[#888]">{TOOL_SHORTCUT_LABELS[sub]}</span>
                        )}
                      </DropdownMenuItem>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            )
          }

          return (
            <Tooltip key={toolDef.key}>
              <TooltipTrigger asChild>
                <button
                  aria-current={active ? 'true' : undefined}
                  className={`flex size-8 cursor-pointer items-center justify-center rounded-lg border-none transition-colors ${
                    active
                      ? 'bg-[#a855f7] text-white'
                      : 'bg-transparent text-[#888] hover:bg-[#3a3a3a] hover:text-[#ccc]'
                  }`}
                  onClick={() => setTool(toolDef.key)}
                >
                  <Icon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                {TOOL_LABELS[toolDef.key]}
                {TOOL_SHORTCUT_LABELS[toolDef.key] && (
                  <kbd className="ml-1 text-[10px] opacity-60">{TOOL_SHORTCUT_LABELS[toolDef.key]}</kbd>
                )}
              </TooltipContent>
            </Tooltip>
          )
        })}

        {/* Divider */}
        <div className="mx-1 h-5 w-px bg-[#444]" />

        {/* Theme button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-[#888] transition-colors hover:bg-[#3a3a3a] hover:text-[#ccc]"
              onClick={() => setShowThemeDialog(true)}
            >
              <Palette className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>Design Tokens</TooltipContent>
        </Tooltip>

        {/* AI Chat button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-none bg-transparent text-[#888] transition-colors hover:bg-[#3a3a3a] hover:text-[#ccc]"
              onClick={toggleAiChat}
            >
              <MessageSquarePlus className="size-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={8}>AI Chat</TooltipContent>
        </Tooltip>
      </div>

      <EditorThemeDialog open={showThemeDialog} onOpenChange={setShowThemeDialog} />
    </>
  )
}
