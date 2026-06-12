import { Sidebar } from 'lucide-react'
import { useCallback, useState } from 'react'


import { IS_TAURI } from '../constants'
import { useEditorStore } from '../store/editor-store'

import {
  Menubar,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from '@/components/ui/menubar'

type MenuItem =
  | {
      label: string
      shortcut?: string
      action?: () => void
      separator?: false
      disabled?: boolean
      sub?: MenuItem[]
    }
  | { separator: true }

const IS_MAC = navigator.platform.includes('Mac')
const MOD = IS_MAC ? '\u2318' : 'Ctrl+'

export function EditorMenu() {
  const documentName = useEditorStore((s) => s.documentName)
  const actions = useEditorStore((s) => s.actions)
  const [editingName, setEditingName] = useState(false)

  const startRename = useCallback(() => {
    setEditingName(true)
  }, [])

  const commitRename = useCallback(
    (input: HTMLInputElement) => {
      const value = input.value.trim()
      if (value) {
        useEditorStore.setState({ documentName: value })
      }
      setEditingName(false)
    },
    [],
  )

  const fileMenu: MenuItem[] = [
    { label: 'Save', shortcut: `${MOD}S`, action: () => void actions.saveFigFile() },
    { label: 'Save as\u2026', shortcut: `${MOD}\u21e7S`, action: () => void actions.saveFigFileAs() },
    { separator: true },
    {
      label: 'Export selection\u2026',
      shortcut: `${MOD}\u21e7E`,
      action: () => {
        const { selectedIds } = useEditorStore.getState()
        if (selectedIds.size > 0) void actions.exportSelection(1, 'PNG')
      },
    },
  ]

  const editMenu: MenuItem[] = [
    { label: 'Undo', shortcut: `${MOD}Z`, action: () => actions.undoAction() },
    { label: 'Redo', shortcut: `${MOD}\u21e7Z`, action: () => actions.redoAction() },
    { separator: true },
    { label: 'Duplicate', shortcut: `${MOD}D`, action: () => actions.duplicateSelected() },
    { label: 'Delete', shortcut: '\u232b', action: () => actions.deleteSelected() },
    { separator: true },
    { label: 'Select all', shortcut: `${MOD}A`, action: () => actions.selectAll() },
  ]

  const viewMenu: MenuItem[] = [
    { label: 'Zoom to fit', shortcut: '\u21e71', action: () => actions.zoomToFit() },
    {
      label: 'Zoom in',
      shortcut: `${MOD}=`,
      action: () => actions.applyZoom(-100, window.innerWidth / 2, window.innerHeight / 2),
    },
    {
      label: 'Zoom out',
      shortcut: `${MOD}-`,
      action: () => actions.applyZoom(100, window.innerWidth / 2, window.innerHeight / 2),
    },
  ]

  const objectMenu: MenuItem[] = [
    { label: 'Group', shortcut: `${MOD}G`, action: () => actions.groupSelected() },
    { label: 'Ungroup', shortcut: `${MOD}\u21e7G`, action: () => actions.ungroupSelected() },
    { separator: true },
    { label: 'Create component', shortcut: `${MOD}\u2325K`, action: () => actions.createComponentFromSelection() },
    { label: 'Create component set', action: () => actions.createComponentSetFromComponents() },
    { label: 'Detach instance', action: () => actions.detachInstance() },
    { separator: true },
    { label: 'Bring to front', shortcut: ']', action: () => actions.bringToFront() },
    { label: 'Send to back', shortcut: '[', action: () => actions.sendToBack() },
  ]

  const arrangeMenu: MenuItem[] = [
    { label: 'Add auto layout', shortcut: '\u21e7A', action: () => actions.wrapInAutoLayout() },
  ]

  const topMenus = [
    { label: 'File', items: fileMenu },
    { label: 'Edit', items: editMenu },
    { label: 'View', items: viewMenu },
    { label: 'Object', items: objectMenu },
    { label: 'Arrange', items: arrangeMenu },
  ]

  return (
    <div className="shrink-0 border-b border-[#333]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        {editingName ? (
          <input
            autoFocus
            className="min-w-0 flex-1 rounded border border-[#a855f7] bg-[#2a2a2a] px-1 py-0.5 text-xs text-[#ccc] outline-none"
            defaultValue={documentName}
            onBlur={(e) => commitRename(e.target as HTMLInputElement)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              if (e.key === 'Escape') setEditingName(false)
            }}
          />
        ) : (
          <span
            className="min-w-0 flex-1 cursor-default truncate rounded px-1 py-0.5 text-xs text-[#ccc] hover:bg-[#3a3a3a]"
            onDoubleClick={startRename}
          >
            {documentName}
          </span>
        )}
        <button
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-[#666] transition-colors hover:bg-[#3a3a3a] hover:text-[#ccc]"
          title="Toggle UI (\u2318\\)"
          onClick={() => {
            const { showUI } = useEditorStore.getState()
            useEditorStore.setState({ showUI: !showUI })
          }}
        >
          <Sidebar className="size-3.5" />
        </button>
      </div>
      {!IS_TAURI && (
        <div className="flex items-center px-1 pb-1">
          <Menubar className="flex items-center gap-0.5 overflow-x-auto border-none bg-transparent p-0 shadow-none">
            {topMenus.map((menu) => (
              <MenubarMenu key={menu.label}>
                <MenubarTrigger className="flex cursor-pointer items-center rounded px-2 py-1 text-xs text-[#666] select-none hover:bg-[#3a3a3a] hover:text-[#ccc] data-[state=open]:bg-[#3a3a3a] data-[state=open]:text-[#ccc]">
                  {menu.label}
                </MenubarTrigger>
                <MenubarContent align="start" className="min-w-52 bg-[#252525] border-[#333]" sideOffset={4}>
                  {menu.items.map((item, i) => {
                    if (item.separator) {
                      return <MenubarSeparator key={`sep-${i}`} className="bg-[#333]" />
                    }
                    if (item.sub) {
                      return (
                        <MenubarSub key={item.label}>
                          <MenubarSubTrigger className="text-xs text-[#ccc] hover:bg-[#3a3a3a]">
                            {item.label}
                          </MenubarSubTrigger>
                          <MenubarSubContent className="bg-[#252525] border-[#333]">
                            {item.sub.map((sub, j) => {
                              if ('separator' in sub && sub.separator) {
                                return <MenubarSeparator key={`sub-sep-${j}`} className="bg-[#333]" />
                              }
                              return (
                                <MenubarItem
                                  key={`${sub.label}-${j}`}
                                  className="text-xs text-[#ccc] hover:bg-[#3a3a3a]"
                                  disabled={sub.disabled}
                                  onSelect={() => sub.action?.()}
                                >
                                  <span className="flex-1">{sub.label}</span>
                                  {sub.shortcut && <span className="text-[11px] text-[#666]">{sub.shortcut}</span>}
                                </MenubarItem>
                              )
                            })}
                          </MenubarSubContent>
                        </MenubarSub>
                      )
                    }
                    return (
                      <MenubarItem
                        key={item.label}
                        className={`flex cursor-pointer items-center gap-2 text-xs ${item.disabled ? 'text-[#6b6b6b]' : 'text-[#ccc] hover:bg-[#3a3a3a]'}`}
                        disabled={item.disabled}
                        onSelect={() => item.action?.()}
                      >
                        <span className="flex-1">{item.label}</span>
                        {item.shortcut && <span className="text-[11px] text-[#666]">{item.shortcut}</span>}
                      </MenubarItem>
                    )
                  })}
                </MenubarContent>
              </MenubarMenu>
            ))}
          </Menubar>
        </div>
      )}
    </div>
  )
}
