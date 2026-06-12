import { useEffect } from 'react'

import { getGraph, getTextEditor, useEditorStore } from '../store/editor-store'
import { TOOL_SHORTCUTS } from '../types'

import type { Tool } from '../types'

function isEditing(e: Event): boolean {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return true
  if (e.target instanceof HTMLElement && e.target.isContentEditable) return true
  return false
}

/** True when the user is editing text on the canvas (TextEditor active) */
function isEditingCanvasText(): boolean {
  return useEditorStore.getState().editingTextId != null
}

export function useKeyboard() {
  const actions = useEditorStore((s) => s.actions)

  useEffect(() => {
    /** Sync TextEditor's text → graph node so renderer sees the update */
    function syncEditorToGraph() {
      const editor = getTextEditor()
      const editId = useEditorStore.getState().editingTextId
      if (editor?.state && editId) {
        getGraph().updateNode(editId, { text: editor.state.text })
      }
      actions.requestRender()
    }

    function onCopy(e: ClipboardEvent) {
      if (isEditing(e)) return
      if (isEditingCanvasText()) {
        const editor = getTextEditor()
        if (editor?.hasSelection()) {
          e.preventDefault()
          const text = editor.getSelectedText()
          if (text) e.clipboardData?.setData('text/plain', text)
        }
        return
      }
      e.preventDefault()
      if (e.clipboardData) actions.writeCopyData(e.clipboardData)
    }

    function onCut(e: ClipboardEvent) {
      if (isEditing(e)) return
      if (isEditingCanvasText()) {
        const editor = getTextEditor()
        const editId = useEditorStore.getState().editingTextId
        const node = editId ? getGraph().getNode(editId) : null
        if (editor?.hasSelection() && node) {
          e.preventDefault()
          const text = editor.getSelectedText()
          if (text) e.clipboardData?.setData('text/plain', text)
          editor.backspace(node)
          syncEditorToGraph()
        }
        return
      }
      e.preventDefault()
      if (e.clipboardData) actions.writeCopyData(e.clipboardData)
      actions.deleteSelected()
    }

    function onPaste(e: ClipboardEvent) {
      if (isEditing(e)) return
      if (isEditingCanvasText()) {
        const editor = getTextEditor()
        const editId = useEditorStore.getState().editingTextId
        const node = editId ? getGraph().getNode(editId) : null
        if (editor?.isActive && node) {
          e.preventDefault()
          const text = e.clipboardData?.getData('text/plain') ?? ''
          if (text) {
            editor.insert(text, node)
            syncEditorToGraph()
          }
        }
        return
      }
      e.preventDefault()
      const html = e.clipboardData?.getData('text/html') ?? ''
      if (html) actions.pasteFromHTML(html)
    }

    function onKeydown(e: KeyboardEvent) {
      if (isEditing(e)) return

      const editingText = isEditingCanvasText()
      const mod = e.metaKey || e.ctrlKey

      // Escape always works — commit text edit, exit vector edit, cancel pen, or clear selection
      if (e.key === 'Escape') {
        if (editingText) {
          actions.commitTextEdit()
          actions.setTool('SELECT')
          return
        }
        const state = useEditorStore.getState()
        if (state.vectorEditId) {
          actions.exitVectorEdit()
          return
        }
        if (state.penState) {
          actions.penCancel()
          return
        }
        actions.clearSelection()
        actions.setTool('SELECT')
        return
      }

      // While editing text on canvas, forward keystrokes to TextEditor
      if (editingText) {
        const editor = getTextEditor()
        const editId = useEditorStore.getState().editingTextId
        const node = editId ? getGraph().getNode(editId) : null
        if (!editor?.isActive || !node) return

        const syncText = syncEditorToGraph

        // Modifier combos during text editing
        if (mod) {
          if (e.key === 'a') {
            e.preventDefault()
            editor.selectAll()
            actions.requestRender()
            return
          }
          if (e.key === 'z' && !e.shiftKey) {
            e.preventDefault()
            actions.undoAction()
            return
          }
          if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
            e.preventDefault()
            actions.redoAction()
            return
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            editor.moveWordLeft(e.shiftKey)
            actions.requestRender()
            return
          }
          if (e.key === 'ArrowRight') {
            e.preventDefault()
            editor.moveWordRight(e.shiftKey)
            actions.requestRender()
            return
          }
          return
        }

        e.preventDefault()

        if (e.key === 'Backspace') {
          editor.backspace(node)
          syncText()
          return
        }
        if (e.key === 'Delete') {
          editor.delete(node)
          syncText()
          return
        }
        if (e.key === 'Enter') {
          editor.insert('\n', node)
          syncText()
          return
        }
        if (e.key === 'ArrowLeft') {
          editor.moveLeft(e.shiftKey)
          actions.requestRender()
          return
        }
        if (e.key === 'ArrowRight') {
          editor.moveRight(e.shiftKey)
          actions.requestRender()
          return
        }
        if (e.key === 'ArrowUp') {
          editor.moveUp(e.shiftKey)
          actions.requestRender()
          return
        }
        if (e.key === 'ArrowDown') {
          editor.moveDown(e.shiftKey)
          actions.requestRender()
          return
        }
        if (e.key === 'Home') {
          editor.moveToLineStart(e.shiftKey)
          actions.requestRender()
          return
        }
        if (e.key === 'End') {
          editor.moveToLineEnd(e.shiftKey)
          actions.requestRender()
          return
        }
        if (e.key === 'Tab') {
          editor.insert('\t', node)
          syncText()
          return
        }
        // Regular character input (single printable chars, not alt combos)
        if (e.key.length === 1 && !e.altKey) {
          editor.insert(e.key, node)
          syncText()
          return
        }
        return
      }

      // Shift+1: zoom to selection (or fit all if no selection)
      if (e.shiftKey && e.key === '!' && !mod) {
        e.preventDefault()
        const { selectedIds } = useEditorStore.getState()
        if (selectedIds.size > 0) {
          actions.zoomToSelection()
        } else {
          actions.zoomToFit()
        }
        return
      }

      const tool = TOOL_SHORTCUTS[e.key.toLowerCase()] as Tool | undefined
      if (tool) {
        actions.setTool(tool)
        return
      }

      // Ctrl+Alt combos
      if (mod && e.altKey) {
        if (e.code === 'KeyK') {
          e.preventDefault()
          actions.createComponentFromSelection()
          return
        }
        if (e.code === 'KeyB') {
          e.preventDefault()
          actions.detachInstance()
          return
        }
      }

      // Ctrl+Shift combos
      if (mod && e.shiftKey) {
        if (e.code === 'KeyK') {
          e.preventDefault()
          actions.createComponentSetFromComponents()
          return
        }
        if (e.code === 'KeyH') {
          e.preventDefault()
          actions.toggleVisibility()
          return
        }
        if (e.code === 'KeyL') {
          e.preventDefault()
          actions.toggleLock()
          return
        }
        if (e.code === 'KeyE') {
          e.preventDefault()
          const { selectedIds } = useEditorStore.getState()
          if (selectedIds.size > 0) {
            void actions.exportSelection(1, 'PNG')
          }
          return
        }
      }

      // Ctrl combos
      if (mod) {
        if (e.code === 'Backslash') {
          e.preventDefault()
          const { showUI } = useEditorStore.getState()
          useEditorStore.setState({ showUI: !showUI })
          return
        }
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          actions.undoAction()
        } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
          e.preventDefault()
          actions.redoAction()
        } else if (e.key === '0') {
          e.preventDefault()
          actions.zoomToFit()
        } else if (e.key === 'd') {
          e.preventDefault()
          actions.duplicateSelected()
        } else if (e.key === 'a') {
          e.preventDefault()
          actions.selectAll()
        } else if (e.key === 's' && e.shiftKey) {
          e.preventDefault()
          void actions.saveFigFileAs()
        } else if (e.key === 's') {
          e.preventDefault()
          void actions.saveFigFile()
        } else if (e.key === 'g' && !e.shiftKey) {
          e.preventDefault()
          actions.groupSelected()
        } else if (e.key === 'g' && e.shiftKey) {
          e.preventDefault()
          actions.ungroupSelected()
        }
        return
      }

      // Shift+A: auto layout
      if (e.shiftKey && e.key === 'A') {
        e.preventDefault()
        const state = useEditorStore.getState()
        const ids = [...state.selectedIds]
        if (ids.length === 1) {
          const graph = getGraph()
          const node = graph.getNode(ids[0])
          if (node?.type === 'FRAME') {
            actions.setLayoutMode(node.id, node.layoutMode === 'NONE' ? 'VERTICAL' : 'NONE')
            return
          }
        }
        if (ids.length > 0) {
          actions.wrapInAutoLayout()
        }
        return
      }

      // Z-order
      if (e.key === ']' && e.metaKey) {
        e.preventDefault()
        actions.bringForward()
        return
      }
      if (e.key === ']') {
        e.preventDefault()
        actions.bringToFront()
        return
      }
      if (e.key === '[' && e.metaKey) {
        e.preventDefault()
        actions.sendBackward()
        return
      }
      if (e.key === '[') {
        e.preventDefault()
        actions.sendToBack()
        return
      }

      // Delete — in vector edit mode, delete selected vertex; otherwise delete selected nodes
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const state = useEditorStore.getState()
        if (state.vectorEditId && state.vectorEditSelectedVertex != null) {
          actions.deleteVectorVertex(state.vectorEditId, state.vectorEditSelectedVertex)
          return
        }
        actions.deleteSelected()
      }

      // Pen commit
      if (e.key === 'Enter') {
        const { penState } = useEditorStore.getState()
        if (penState) {
          e.preventDefault()
          actions.penCommit(false)
          return
        }
      }
    }

    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    window.addEventListener('keydown', onKeydown)

    return () => {
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
      window.removeEventListener('keydown', onKeydown)
    }
  }, [actions])
}
