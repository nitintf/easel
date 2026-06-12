import { useMemo } from 'react'

import { getGraph, useEditorStore } from '../store/editor-store'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'


/** Context menu content for node operations (used in layers panel and canvas) */
export function NodeContextMenu({ children }: { children: React.ReactNode }) {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const currentPageId = useEditorStore((s) => s.currentPageId)
  const sceneVersion = useEditorStore((s) => s.sceneVersion)
  const actions = useEditorStore((s) => s.actions)

  const hasSelection = selectedIds.size > 0
  const multiCount = selectedIds.size

  const singleNode = useMemo(() => {
    void sceneVersion
    if (selectedIds.size !== 1) return null
    const id = [...selectedIds][0]
    return getGraph().getNode(id) ?? null
  }, [selectedIds, sceneVersion])

  const isInstance = singleNode?.type === 'INSTANCE'
  const isComponent = singleNode?.type === 'COMPONENT'
  const isGroup = singleNode?.type === 'GROUP'

  const canCreateComponentSet = useMemo(() => {
    void sceneVersion
    if (selectedIds.size < 2) return false
    return [...selectedIds].every((id) => {
      const n = getGraph().getNode(id)
      return n?.type === 'COMPONENT'
    })
  }, [selectedIds, sceneVersion])

  const otherPages = useMemo(() => {
    void sceneVersion
    return getGraph().getPages().filter((p) => p.id !== currentPageId)
  }, [sceneVersion, currentPageId])

  const isVisible = singleNode?.visible ?? true
  const isLocked = singleNode?.locked ?? false

  const itemClass = 'flex w-full cursor-pointer select-none items-center justify-between gap-6 rounded px-2 py-1.5 text-xs text-[#ccc] outline-none hover:bg-[#3a3a3a] data-[disabled]:cursor-default data-[disabled]:text-[#888]'
  const componentItemClass = 'flex w-full cursor-pointer select-none items-center justify-between gap-6 rounded px-2 py-1.5 text-xs text-[#9747ff] outline-none hover:bg-[#9747ff]/10 data-[disabled]:cursor-default data-[disabled]:text-[#9747ff]/40'

  function onCanvasRightClick(e: React.MouseEvent) {
    const el = e.currentTarget as HTMLElement
    const canvas = el.querySelector('canvas')
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const { x: cx, y: cy } = actions.screenToCanvas(sx, sy)

    const hit = getGraph().hitTest(cx, cy, useEditorStore.getState().currentPageId)
    if (hit) {
      if (!selectedIds.has(hit.id)) {
        actions.select([hit.id])
      }
    } else {
      actions.clearSelection()
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={onCanvasRightClick}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="z-50 min-w-56 bg-[#252525] border-[#333] shadow-[0_8px_30px_rgb(0_0_0/0.4)]">
        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => document.execCommand('copy')}>
          <span>Copy</span><span className="text-[11px] text-[#666]">{'\u2318'}C</span>
        </ContextMenuItem>
        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => document.execCommand('cut')}>
          <span>Cut</span><span className="text-[11px] text-[#666]">{'\u2318'}X</span>
        </ContextMenuItem>
        <ContextMenuItem className={itemClass} onSelect={() => document.execCommand('paste')}>
          <span>Paste here</span><span className="text-[11px] text-[#666]">{'\u2318'}V</span>
        </ContextMenuItem>
        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => actions.duplicateSelected()}>
          <span>Duplicate</span><span className="text-[11px] text-[#666]">{'\u2318'}D</span>
        </ContextMenuItem>
        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => actions.deleteSelected()}>
          <span>Delete</span><span className="text-[11px] text-[#666]">{'\u232b'}</span>
        </ContextMenuItem>

        <ContextMenuSeparator className="bg-[#333]" />

        {otherPages.length > 0 && hasSelection && (
          <ContextMenuSub>
            <ContextMenuSubTrigger className={itemClass}>
              <span>Move to page</span>
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="bg-[#252525] border-[#333]">
              {otherPages.map((page) => (
                <ContextMenuItem key={page.id} className={itemClass} onSelect={() => actions.moveToPage(page.id)}>
                  {page.name}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}

        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => actions.bringToFront()}>
          <span>Bring to front</span><span className="text-[11px] text-[#666]">]</span>
        </ContextMenuItem>
        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => actions.bringForward()}>
          <span>Bring forward</span><span className="text-[11px] text-[#666]">{'\u2318'}]</span>
        </ContextMenuItem>
        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => actions.sendBackward()}>
          <span>Send backward</span><span className="text-[11px] text-[#666]">{'\u2318'}[</span>
        </ContextMenuItem>
        <ContextMenuItem className={itemClass} disabled={!hasSelection} onSelect={() => actions.sendToBack()}>
          <span>Send to back</span><span className="text-[11px] text-[#666]">[</span>
        </ContextMenuItem>

        <ContextMenuSeparator className="bg-[#333]" />

        <ContextMenuItem className={itemClass} disabled={multiCount < 2} onSelect={() => actions.groupSelected()}>
          <span>Group</span><span className="text-[11px] text-[#666]">{'\u2318'}G</span>
        </ContextMenuItem>
        {isGroup && (
          <ContextMenuItem className={itemClass} onSelect={() => actions.ungroupSelected()}>
            <span>Ungroup</span><span className="text-[11px] text-[#666]">{'\u21e7\u2318'}G</span>
          </ContextMenuItem>
        )}
        {hasSelection && (
          <ContextMenuItem className={itemClass} onSelect={() => actions.wrapInAutoLayout()}>
            <span>Add auto layout</span><span className="text-[11px] text-[#666]">{'\u21e7'}A</span>
          </ContextMenuItem>
        )}

        <ContextMenuSeparator className="bg-[#333]" />

        <ContextMenuItem className={componentItemClass} disabled={!hasSelection} onSelect={() => actions.createComponentFromSelection()}>
          <span>Create component</span><span className="text-[11px] text-[#9747ff]/60">{'\u2325\u2318'}K</span>
        </ContextMenuItem>
        {canCreateComponentSet && (
          <ContextMenuItem className={componentItemClass} onSelect={() => actions.createComponentSetFromComponents()}>
            <span>Create component set</span>
          </ContextMenuItem>
        )}
        {isComponent && singleNode && (
          <ContextMenuItem className={componentItemClass} onSelect={() => actions.createInstanceFromComponent(singleNode.id)}>
            <span>Create instance</span>
          </ContextMenuItem>
        )}
        {isInstance && (
          <ContextMenuItem className={componentItemClass} onSelect={() => actions.goToMainComponent()}>
            <span>Go to main component</span>
          </ContextMenuItem>
        )}
        {isInstance && (
          <ContextMenuItem className={itemClass} onSelect={() => actions.detachInstance()}>
            <span>Detach instance</span><span className="text-[11px] text-[#666]">{'\u2325\u2318'}B</span>
          </ContextMenuItem>
        )}

        {hasSelection && (
          <>
            <ContextMenuSeparator className="bg-[#333]" />
            <ContextMenuItem className={itemClass} onSelect={() => actions.toggleVisibility()}>
              <span>{isVisible ? 'Hide' : 'Show'}</span><span className="text-[11px] text-[#666]">{'\u21e7\u2318'}H</span>
            </ContextMenuItem>
            <ContextMenuItem className={itemClass} onSelect={() => actions.toggleLock()}>
              <span>{isLocked ? 'Unlock' : 'Lock'}</span><span className="text-[11px] text-[#666]">{'\u21e7\u2318'}L</span>
            </ContextMenuItem>
            <ContextMenuSeparator className="bg-[#333]" />
            <ContextMenuItem className={itemClass} onSelect={() => void actions.exportSelection(1, 'PNG')}>
              <span>Export as PNG</span><span className="text-[11px] text-[#666]">{'\u21e7\u2318'}E</span>
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
