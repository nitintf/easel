
import { computeSelectionBounds, computeSnap, applyConstraints } from '@easel/editor-core'
import { useEffect, useRef, useCallback } from 'react'


import {
  AUTO_LAYOUT_BREAK_THRESHOLD,
  HANDLE_HIT_RADIUS,
  ROTATION_HIT_RADIUS,
  PEN_CLOSE_THRESHOLD,
  ROTATION_SNAP_DEGREES,
  ROTATION_HIT_OFFSET,
  DEFAULT_TEXT_WIDTH,
  DEFAULT_TEXT_HEIGHT,
} from '../constants'
import { useEditorStore, getGraph, getTextEditor } from '../store/editor-store'
import { TOOL_TO_NODE } from '../types'

import type {
  HandlePosition,
  DragState,
  DragMove,
  DragResize,
} from '../types'
import type { SceneNode } from '@easel/editor-core'
import type { RefObject } from 'react'

const HANDLE_CURSORS: Record<HandlePosition, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

function getScreenRect(
  absX: number, absY: number, w: number, h: number,
  zoom: number, panX: number, panY: number,
) {
  return {
    x: absX * zoom + panX,
    y: absY * zoom + panY,
    w: w * zoom,
    h: h * zoom,
  }
}

function hitTestHandle(
  sx: number, sy: number,
  absX: number, absY: number, w: number, h: number,
  zoom: number, panX: number, panY: number,
  rotation: number,
): HandlePosition | null {
  const rect = getScreenRect(absX, absY, w, h, zoom, panX, panY)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const rad = (-rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = sx - cx
  const dy = sy - cy
  const rx = dx * cos - dy * sin + cx
  const ry = dx * sin + dy * cos + cy

  const r = HANDLE_HIT_RADIUS
  const handles: [HandlePosition, number, number][] = [
    ['nw', rect.x, rect.y],
    ['n', rect.x + rect.w / 2, rect.y],
    ['ne', rect.x + rect.w, rect.y],
    ['e', rect.x + rect.w, rect.y + rect.h / 2],
    ['se', rect.x + rect.w, rect.y + rect.h],
    ['s', rect.x + rect.w / 2, rect.y + rect.h],
    ['sw', rect.x, rect.y + rect.h],
    ['w', rect.x, rect.y + rect.h / 2],
  ]

  for (const [pos, hx, hy] of handles) {
    if (Math.abs(rx - hx) <= r && Math.abs(ry - hy) <= r) return pos
  }
  return null
}

function hitTestRotationHandle(
  sx: number, sy: number,
  absX: number, absY: number, w: number, h: number,
  zoom: number, panX: number, panY: number,
  rotation: number,
): boolean {
  const rect = getScreenRect(absX, absY, w, h, zoom, panX, panY)
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const rad = (-rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const dx = sx - cx
  const dy = sy - cy
  const rx = dx * cos - dy * sin + cx
  const ry = dx * sin + dy * cos + cy

  const corners: [number, number][] = [
    [rect.x, rect.y],
    [rect.x + rect.w, rect.y],
    [rect.x + rect.w, rect.y + rect.h],
    [rect.x, rect.y + rect.h],
  ]
  const offsets: [number, number][] = [
    [-ROTATION_HIT_OFFSET, -ROTATION_HIT_OFFSET],
    [ROTATION_HIT_OFFSET, -ROTATION_HIT_OFFSET],
    [ROTATION_HIT_OFFSET, ROTATION_HIT_OFFSET],
    [-ROTATION_HIT_OFFSET, ROTATION_HIT_OFFSET],
  ]

  for (let i = 0; i < 4; i++) {
    const [cornX, cornY] = corners[i]
    const [offX, offY] = offsets[i]
    if (
      Math.abs(rx - (cornX + offX)) <= ROTATION_HIT_RADIUS &&
      Math.abs(ry - (cornY + offY)) <= ROTATION_HIT_RADIUS
    ) {
      return true
    }
  }
  return false
}

interface GestureEvent extends Event {
  scale: number
  clientX?: number
  clientY?: number
}

export function useCanvasInput(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  hitTestSectionTitle: (x: number, y: number) => SceneNode | null,
  hitTestComponentLabel: (x: number, y: number) => SceneNode | null,
) {
  const dragRef = useRef<DragState | null>(null)
  const cursorOverrideRef = useRef<string | null>(null)

  // Expose cursor override as a state for the canvas component to use
  const cursorRef = useRef<string | null>(null)

  const getCoords = useCallback(
    (e: MouseEvent) => {
      const state = useEditorStore.getState()
      const canvas = canvasRef.current
      if (!canvas) return { sx: 0, sy: 0, cx: 0, cy: 0 }
      const rect = canvas.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      return {
        sx,
        sy,
        cx: (sx - state.panX) / state.zoom,
        cy: (sy - state.panY) / state.zoom,
      }
    },
    [canvasRef],
  )

  // ── Pointer down ──────────────────────────────────────────

  const onMouseDown = useCallback(
    (e: MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return
      const state = useEditorStore.getState()
      const { actions } = state
      const graph = getGraph()
      const { sx, sy, cx, cy } = getCoords(e)

      // Middle click or space+click → pan
      if (e.button === 1 || state.activeTool === 'HAND') {
        dragRef.current = {
          type: 'pan',
          startScreenX: e.clientX,
          startScreenY: e.clientY,
          startPanX: state.panX,
          startPanY: state.panY,
        }
        return
      }

      // Pen tool
      if (state.activeTool === 'PEN') {
        actions.penAddVertex(cx, cy)
        dragRef.current = { type: 'pen-drag', startX: cx, startY: cy }
        return
      }

      // Text tool — create text node on click
      if (state.activeTool === 'TEXT') {
        const nodeId = actions.createShape('TEXT', cx, cy, DEFAULT_TEXT_WIDTH, DEFAULT_TEXT_HEIGHT)
        actions.select([nodeId])
        actions.setTool('SELECT')
        actions.startTextEditing(nodeId)
        return
      }

      // Draw tools: FRAME, SECTION, RECTANGLE, ELLIPSE, LINE, POLYGON, STAR
      const drawType = TOOL_TO_NODE[state.activeTool]
      if (drawType) {
        const nodeId = actions.createShape(drawType, cx, cy, 0, 0)
        actions.select([nodeId])
        dragRef.current = { type: 'draw', startX: cx, startY: cy, nodeId }
        return
      }

      // SELECT tool logic
      if (state.editingTextId) {
        const editNode = graph.getNode(state.editingTextId)
        if (editNode) {
          const abs = graph.getAbsolutePosition(editNode.id)
          if (
            cx >= abs.x &&
            cy >= abs.y &&
            cx <= abs.x + editNode.width &&
            cy <= abs.y + editNode.height
          ) {
            dragRef.current = { type: 'text-select', startX: cx, startY: cy }
            return
          }
        }
        actions.commitTextEdit()
      }

      // Vector edit mode: check vertex/tangent hit
      if (state.vectorEditId) {
        const vecNode = graph.getNode(state.vectorEditId)
        if (vecNode?.vectorNetwork) {
          const abs = graph.getAbsolutePosition(state.vectorEditId)
          const vn = vecNode.vectorNetwork
          const VERTEX_HIT_RADIUS = 8 / state.zoom

          // Check tangent handles first (they're smaller targets, check them first)
          for (let si = 0; si < vn.segments.length; si++) {
            const seg = vn.segments[si]
            if (seg.tangentStart.x !== 0 || seg.tangentStart.y !== 0) {
              const tx = abs.x + vn.vertices[seg.start].x + seg.tangentStart.x
              const ty = abs.y + vn.vertices[seg.start].y + seg.tangentStart.y
              if (Math.hypot(cx - tx, cy - ty) < VERTEX_HIT_RADIUS) {
                actions.selectVectorVertex(seg.start)
                dragRef.current = {
                  type: 'vector-tangent',
                  nodeId: state.vectorEditId,
                  segmentIndex: si,
                  which: 'start',
                  startX: cx,
                  startY: cy,
                  origTx: seg.tangentStart.x,
                  origTy: seg.tangentStart.y,
                }
                return
              }
            }
            if (seg.tangentEnd.x !== 0 || seg.tangentEnd.y !== 0) {
              const tx = abs.x + vn.vertices[seg.end].x + seg.tangentEnd.x
              const ty = abs.y + vn.vertices[seg.end].y + seg.tangentEnd.y
              if (Math.hypot(cx - tx, cy - ty) < VERTEX_HIT_RADIUS) {
                actions.selectVectorVertex(seg.end)
                dragRef.current = {
                  type: 'vector-tangent',
                  nodeId: state.vectorEditId,
                  segmentIndex: si,
                  which: 'end',
                  startX: cx,
                  startY: cy,
                  origTx: seg.tangentEnd.x,
                  origTy: seg.tangentEnd.y,
                }
                return
              }
            }
          }

          // Check vertex handles
          for (let vi = 0; vi < vn.vertices.length; vi++) {
            const v = vn.vertices[vi]
            const vx = abs.x + v.x
            const vy = abs.y + v.y
            if (Math.hypot(cx - vx, cy - vy) < VERTEX_HIT_RADIUS) {
              actions.selectVectorVertex(vi)
              dragRef.current = {
                type: 'vector-vertex',
                nodeId: state.vectorEditId,
                vertexIndex: vi,
                startX: cx,
                startY: cy,
                origX: v.x,
                origY: v.y,
              }
              return
            }
          }

          // Click outside vertices: exit vector edit mode
          actions.exitVectorEdit()
        }
      }

      // Check rotation handle
      if (state.selectedIds.size === 1) {
        const id = [...state.selectedIds][0]
        const node = graph.getNode(id)
        if (node) {
          const abs = graph.getAbsolutePosition(id)
          if (
            hitTestRotationHandle(
              sx, sy, abs.x, abs.y, node.width, node.height,
              state.zoom, state.panX, state.panY, node.rotation,
            )
          ) {
            const rect = getScreenRect(abs.x, abs.y, node.width, node.height, state.zoom, state.panX, state.panY)
            const centerX = rect.x + rect.w / 2
            const centerY = rect.y + rect.h / 2
            dragRef.current = {
              type: 'rotate',
              nodeId: id,
              centerX,
              centerY,
              startAngle: Math.atan2(sy - centerY, sx - centerX) * (180 / Math.PI),
              origRotation: node.rotation,
            }
            return
          }
        }
      }

      // Check resize handle
      for (const id of state.selectedIds) {
        const node = graph.getNode(id)
        if (!node) continue
        const abs = graph.getAbsolutePosition(id)
        const handle = hitTestHandle(
          sx, sy, abs.x, abs.y, node.width, node.height,
          state.zoom, state.panX, state.panY, node.rotation,
        )
        if (handle) {
          dragRef.current = {
            type: 'resize',
            handle,
            startX: cx,
            startY: cy,
            origRect: { x: node.x, y: node.y, width: node.width, height: node.height },
            nodeId: id,
          }
          return
        }
      }

      // Hit test scene
      const hit =
        hitTestSectionTitle(cx, cy) ??
        hitTestComponentLabel(cx, cy) ??
        graph.hitTest(cx, cy)

      if (hit) {
        const isSelected = state.selectedIds.has(hit.id)

        if (e.shiftKey) {
          actions.select([hit.id], true)
        } else if (!isSelected) {
          actions.select([hit.id])
        }

        // Start move
        let selected: Set<string>
        if (e.shiftKey && !isSelected) {
          selected = new Set([...state.selectedIds, hit.id])
        } else if (isSelected) {
          selected = state.selectedIds
        } else {
          selected = new Set([hit.id])
        }

        const originals = new Map<string, { x: number; y: number }>()
        for (const id of selected) {
          const n = graph.getNode(id)
          if (n) originals.set(id, { x: n.x, y: n.y })
        }

        const autoLayoutParentId = hit.parentId && graph.getNode(hit.parentId)?.layoutMode !== 'NONE'
          ? hit.parentId
          : undefined

        dragRef.current = {
          type: 'move',
          startX: cx,
          startY: cy,
          originals,
          autoLayoutParentId,
        }

        // Alt+drag = duplicate
        if (e.altKey) {
          actions.duplicateSelected()
          const newState = useEditorStore.getState()
          const newOriginals = new Map<string, { x: number; y: number }>()
          for (const id of newState.selectedIds) {
            const n = graph.getNode(id)
            if (n) newOriginals.set(id, { x: n.x, y: n.y })
          }
          dragRef.current = {
            type: 'move',
            startX: cx,
            startY: cy,
            originals: newOriginals,
            duplicated: true,
          }
        }
      } else {
        // Click on empty area → deselect and start marquee
        if (!e.shiftKey) actions.clearSelection()
        dragRef.current = { type: 'marquee', startX: cx, startY: cy }
      }
    },
    [canvasRef, getCoords, hitTestSectionTitle, hitTestComponentLabel],
  )

  // ── Pointer move ──────────────────────────────────────────

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      const state = useEditorStore.getState()
      const { actions } = state
      const graph = getGraph()

      // Update pen cursor
      if (state.activeTool === 'PEN' && state.penState && !dragRef.current) {
        const { cx, cy } = getCoords(e)
        useEditorStore.setState({ penCursorX: cx, penCursorY: cy })
        if (state.penState.vertices.length > 2) {
          const first = state.penState.vertices[0]
          const dist = Math.hypot(cx - first.x, cy - first.y)
          actions.penSetClosingToFirst(dist < PEN_CLOSE_THRESHOLD)
        }
        actions.requestRepaint()
      }

      // Cursor + hover highlight
      if (!dragRef.current && state.activeTool === 'SELECT') {
        const { sx, sy, cx, cy } = getCoords(e)
        let cursor: string | null = null

        if (state.selectedIds.size === 1) {
          const id = [...state.selectedIds][0]
          const node = graph.getNode(id)
          if (node) {
            const abs = graph.getAbsolutePosition(id)
            if (
              hitTestRotationHandle(
                sx, sy, abs.x, abs.y, node.width, node.height,
                state.zoom, state.panX, state.panY, node.rotation,
              )
            ) {
              cursor = 'grab'
            }
          }
        }

        if (!cursor) {
          for (const id of state.selectedIds) {
            const node = graph.getNode(id)
            if (!node) continue
            const abs = graph.getAbsolutePosition(id)
            const handle = hitTestHandle(
              sx, sy, abs.x, abs.y, node.width, node.height,
              state.zoom, state.panX, state.panY, node.rotation,
            )
            if (handle) {
              cursor = HANDLE_CURSORS[handle]
              break
            }
          }
        }

        // Show move cursor when hovering over a selected object (not on handles)
        if (!cursor && state.selectedIds.size > 0) {
          const hit = graph.hitTest(cx, cy)
          if (hit && state.selectedIds.has(hit.id)) {
            cursor = 'move'
          }
        }

        cursorOverrideRef.current = cursor
        cursorRef.current = cursor

        const hit =
          hitTestSectionTitle(cx, cy) ??
          hitTestComponentLabel(cx, cy) ??
          graph.hitTest(cx, cy)
        actions.setHoveredNode(hit && !state.selectedIds.has(hit.id) ? hit.id : null)
      }

      if (!dragRef.current) return
      const d = dragRef.current

      if (d.type === 'pan') {
        const dx = e.clientX - d.startScreenX
        const dy = e.clientY - d.startScreenY
        useEditorStore.setState({
          panX: d.startPanX + dx,
          panY: d.startPanY + dy,
        })
        actions.requestRepaint()
        return
      }

      const { cx, cy, sx, sy } = getCoords(e)

      if (d.type === 'rotate') {
        const currentAngle = Math.atan2(sy - d.centerY, sx - d.centerX) * (180 / Math.PI)
        let rotation = d.origRotation + (currentAngle - d.startAngle)
        if (e.shiftKey) {
          rotation = Math.round(rotation / ROTATION_SNAP_DEGREES) * ROTATION_SNAP_DEGREES
        }
        rotation = ((((rotation + 180) % 360) + 360) % 360) - 180
        actions.setRotationPreview({ nodeId: d.nodeId, angle: rotation })
        return
      }

      if (d.type === 'move') {
        let dx = cx - d.startX
        let dy = cy - d.startY

        if (d.autoLayoutParentId && !d.brokeFromAutoLayout) {
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < AUTO_LAYOUT_BREAK_THRESHOLD) {
            computeAutoLayoutIndicator(d, cx, cy)
            return
          }
          d.brokeFromAutoLayout = true
          actions.setLayoutInsertIndicator(null)
        }

        let dropTarget = graph.hitTestFrame(cx, cy, state.selectedIds, state.currentPageId)
        const movingSection = [...state.selectedIds].some(
          (id) => graph.getNode(id)?.type === 'SECTION',
        )
        if (movingSection && dropTarget && dropTarget.type !== 'SECTION' && dropTarget.type !== 'CANVAS') {
          dropTarget = null
        }
        const dropParent = dropTarget ? graph.getNode(dropTarget.id) : null

        if (dropParent && dropParent.layoutMode !== 'NONE') {
          computeAutoLayoutIndicatorForFrame(dropParent, cx, cy)
          actions.setDropTarget(dropParent.id)
          for (const [id, orig] of d.originals) {
            graph.updateNode(id, { x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) })
          }
          actions.requestRender()
          return
        }

        actions.setLayoutInsertIndicator(null)

        // Snap
        const selectedNodes: SceneNode[] = []
        for (const [id, orig] of d.originals) {
          const n = graph.getNode(id)
          if (n) {
            const abs = graph.getAbsolutePosition(id)
            const parentAbs = n.parentId ? graph.getAbsolutePosition(n.parentId) : { x: 0, y: 0 }
            selectedNodes.push({
              ...n,
              x: abs.x - parentAbs.x - n.x + orig.x + dx,
              y: abs.y - parentAbs.y - n.y + orig.y + dy,
            })
          }
        }

        const bounds = computeSelectionBounds(selectedNodes)
        if (bounds) {
          const firstId = [...d.originals.keys()][0]
          const firstNode = graph.getNode(firstId)
          const parentId = firstNode?.parentId ?? state.currentPageId
          const siblings = graph.getChildren(parentId)
          const parentAbs = !actions.isTopLevel(parentId) ? graph.getAbsolutePosition(parentId) : { x: 0, y: 0 }
          const absTargets = siblings.map((n) => ({ ...n, x: n.x + parentAbs.x, y: n.y + parentAbs.y }))
          const absBounds = { x: bounds.x + parentAbs.x, y: bounds.y + parentAbs.y, width: bounds.width, height: bounds.height }
          const snap = computeSnap(state.selectedIds, absBounds, absTargets)
          dx += snap.dx
          dy += snap.dy
          actions.setSnapGuides(snap.guides)
        }

        for (const [id, orig] of d.originals) {
          actions.updateNode(id, { x: Math.round(orig.x + dx), y: Math.round(orig.y + dy) })
        }
        actions.setDropTarget(dropTarget?.id ?? null)
        return
      }

      if (d.type === 'text-select') {
        const editId = state.editingTextId
        const editNode = editId ? graph.getNode(editId) : null
        if (editNode) {
          const editor = getTextEditor()
          if (editor) {
            const abs = graph.getAbsolutePosition(editNode.id)
            editor.setCursorAt(cx - abs.x, cy - abs.y, true)
            actions.requestRender()
          }
        }
        return
      }

      if (d.type === 'vector-vertex') {
        const node = graph.getNode(d.nodeId)
        if (node?.vectorNetwork) {
          const network = structuredClone(node.vectorNetwork)
          const dx = cx - d.startX
          const dy = cy - d.startY
          network.vertices[d.vertexIndex] = {
            ...network.vertices[d.vertexIndex],
            x: d.origX + dx,
            y: d.origY + dy,
          }
          actions.updateNode(d.nodeId, { vectorNetwork: network })
        }
        return
      }

      if (d.type === 'vector-tangent') {
        const node = graph.getNode(d.nodeId)
        if (node?.vectorNetwork) {
          const network = structuredClone(node.vectorNetwork)
          const dx = cx - d.startX
          const dy = cy - d.startY
          const seg = network.segments[d.segmentIndex]
          if (d.which === 'start') {
            seg.tangentStart = { x: d.origTx + dx, y: d.origTy + dy }
          } else {
            seg.tangentEnd = { x: d.origTx + dx, y: d.origTy + dy }
          }
          actions.updateNode(d.nodeId, { vectorNetwork: network })
        }
        return
      }

      if (d.type === 'resize') {
        applyResize(d, cx, cy, e.shiftKey, e.altKey)
        return
      }

      if (d.type === 'pen-drag') {
        const tx = cx - d.startX
        const ty = cy - d.startY
        if (Math.hypot(tx, ty) > 2) {
          actions.penSetDragTangent(tx, ty)
        }
        return
      }

      if (d.type === 'draw') {
        let w = cx - d.startX
        let h = cy - d.startY
        if (e.shiftKey) {
          const size = Math.max(Math.abs(w), Math.abs(h))
          w = Math.sign(w) * size
          h = Math.sign(h) * size
        }
        actions.updateNode(d.nodeId, {
          x: w < 0 ? d.startX + w : d.startX,
          y: h < 0 ? d.startY + h : d.startY,
          width: Math.abs(w),
          height: Math.abs(h),
        })
        return
      }

      if (d.type === 'marquee') { // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- exhaustive check for clarity
        const minX = Math.min(d.startX, cx)
        const minY = Math.min(d.startY, cy)
        const maxX = Math.max(d.startX, cx)
        const maxY = Math.max(d.startY, cy)

        const hits: string[] = []
        for (const node of graph.getChildren(state.currentPageId)) {
          if (
            node.x + node.width > minX &&
            node.x < maxX &&
            node.y + node.height > minY &&
            node.y < maxY
          ) {
            hits.push(node.id)
          }
        }
        actions.select(hits)
        actions.setMarquee({ x: minX, y: minY, width: maxX - minX, height: maxY - minY })
      }
    },
    [canvasRef, getCoords, hitTestSectionTitle, hitTestComponentLabel],
  )

  // ── Pointer up ────────────────────────────────────────────

  const onMouseUp = useCallback(() => {
    if (!dragRef.current) return
    const d = dragRef.current
    const state = useEditorStore.getState()
    const { actions } = state
    const graph = getGraph()

    if (d.type === 'move') {
      const indicator = state.layoutInsertIndicator
      actions.setLayoutInsertIndicator(null)
      actions.setSnapGuides([])

      if (indicator) {
        for (const id of state.selectedIds) {
          actions.reorderInAutoLayout(id, indicator.parentId, indicator.index)
        }
        actions.setDropTarget(null)
      } else {
        const moved = [...d.originals].some(([id, orig]) => {
          const node = graph.getNode(id)
          return node && (node.x !== orig.x || node.y !== orig.y)
        })

        if (moved) {
          actions.commitMove(d.originals)
          const dropId = state.dropTargetId
          if (dropId) {
            actions.reparentNodes([...state.selectedIds], dropId)
          } else {
            for (const id of state.selectedIds) {
              const node = graph.getNode(id)
              if (!node?.parentId || actions.isTopLevel(node.parentId)) continue
              const parent = graph.getNode(node.parentId)
              if (!parent || (parent.type !== 'FRAME' && parent.type !== 'SECTION')) continue
              const outsideX = node.x + node.width < 0 || node.x > parent.width
              const outsideY = node.y + node.height < 0 || node.y > parent.height
              if (outsideX || outsideY) {
                const grandparentId = parent.parentId ?? state.currentPageId
                graph.reparentNode(id, grandparentId)
              }
            }
          }
        }
        actions.setDropTarget(null)
      }
    }

    if (d.type === 'text-select') {
      dragRef.current = null
      return
    }

    if (d.type === 'resize') {
      actions.commitResize(d.nodeId, d.origRect)
    }

    if (d.type === 'vector-vertex') {
      const node = graph.getNode(d.nodeId)
      if (node?.vectorNetwork) {
        const v = node.vectorNetwork.vertices[d.vertexIndex]
        if (v.x !== d.origX || v.y !== d.origY) {
          const current = structuredClone(node.vectorNetwork)
          const previous = structuredClone(current)
          previous.vertices[d.vertexIndex] = {
            ...previous.vertices[d.vertexIndex],
            x: d.origX,
            y: d.origY,
          }
          actions.commitNodeUpdate(d.nodeId, { vectorNetwork: previous }, 'Move vertex')
        }
      }
      dragRef.current = null
      return
    }

    if (d.type === 'vector-tangent') {
      const node = graph.getNode(d.nodeId)
      if (node?.vectorNetwork) {
        const seg = node.vectorNetwork.segments[d.segmentIndex]
        const origVal = d.which === 'start' ? seg.tangentStart : seg.tangentEnd
        if (origVal.x !== d.origTx || origVal.y !== d.origTy) {
          const previous = structuredClone(node.vectorNetwork)
          if (d.which === 'start') {
            previous.segments[d.segmentIndex].tangentStart = { x: d.origTx, y: d.origTy }
          } else {
            previous.segments[d.segmentIndex].tangentEnd = { x: d.origTx, y: d.origTy }
          }
          actions.commitNodeUpdate(d.nodeId, { vectorNetwork: previous }, 'Adjust tangent')
        }
      }
      dragRef.current = null
      return
    }

    if (d.type === 'pen-drag') {
      dragRef.current = null
      return
    }

    if (d.type === 'rotate') {
      const preview = state.rotationPreview
      if (preview) {
        actions.updateNode(d.nodeId, { rotation: preview.angle })
        actions.commitRotation(d.nodeId, d.origRotation)
      }
      actions.setRotationPreview(null)
    }

    if (d.type === 'draw') {
      const node = graph.getNode(d.nodeId)
      if (node && node.width < 2 && node.height < 2) {
        actions.updateNode(d.nodeId, { width: 100, height: 100 })
      }
      if (node?.type === 'SECTION') {
        actions.adoptNodesIntoSection(node.id)
      }
      actions.setTool('SELECT')
    }

    if (d.type === 'marquee') {
      actions.setMarquee(null)
    }

    dragRef.current = null
    cursorOverrideRef.current = null
    cursorRef.current = null
  }, [])

  // ── Wheel / zoom ──────────────────────────────────────────

  const wheelAccumRef = useRef({
    deltaX: 0, deltaY: 0, zoomDelta: 0,
    zoomCenterX: 0, zoomCenterY: 0,
    hasZoom: false, rafId: 0,
  })

  const flushWheel = useCallback(() => {
    const acc = wheelAccumRef.current
    acc.rafId = 0
    const { actions } = useEditorStore.getState()
    if (acc.hasZoom) {
      actions.applyZoom(acc.zoomDelta, acc.zoomCenterX, acc.zoomCenterY)
    } else {
      actions.pan(acc.deltaX, acc.deltaY)
    }
    acc.deltaX = 0
    acc.deltaY = 0
    acc.zoomDelta = 0
    acc.hasZoom = false
  }, [])

  const onWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault()
      const canvas = canvasRef.current
      if (!canvas) return
      const acc = wheelAccumRef.current

      if (e.ctrlKey || e.metaKey) {
        const rect = canvas.getBoundingClientRect()
        acc.zoomCenterX = e.clientX - rect.left
        acc.zoomCenterY = e.clientY - rect.top
        acc.zoomDelta += e.deltaY
        acc.hasZoom = true
      } else {
        acc.deltaX -= e.deltaX
        acc.deltaY -= e.deltaY
      }
      if (!acc.rafId) {
        acc.rafId = requestAnimationFrame(flushWheel)
      }
    },
    [canvasRef, flushWheel],
  )

  // ── Double click ──────────────────────────────────────────

  const onDblClick = useCallback(
    (e: MouseEvent) => {
      const state = useEditorStore.getState()
      if (state.editingTextId) return
      const graph = getGraph()
      const { cx, cy } = getCoords(e)

      const hit =
        hitTestSectionTitle(cx, cy) ??
        hitTestComponentLabel(cx, cy) ??
        graph.hitTestDeep(cx, cy, state.currentPageId)
      if (!hit) return

      if (hit.type === 'TEXT') {
        state.actions.select([hit.id])
        state.actions.startTextEditing(hit.id)
        const editor = getTextEditor()
        if (editor) {
          const abs = graph.getAbsolutePosition(hit.id)
          editor.selectWordAt(cx - abs.x, cy - abs.y)
          state.actions.requestRender()
        }
        return
      }

      if (hit.type === 'VECTOR' && hit.vectorNetwork) {
        state.actions.select([hit.id])
        state.actions.enterVectorEdit(hit.id)
        return
      }

      state.actions.select([hit.id])
    },
    [getCoords, hitTestSectionTitle, hitTestComponentLabel],
  )

  // ── Resize helper ─────────────────────────────────────────

  function applyResize(d: DragResize, cx: number, cy: number, constrain: boolean, fromCenter = false) {
    const { handle, origRect } = d
    let { x, y, width, height } = origRect
    const dx = cx - d.startX
    const dy = cy - d.startY

    const moveLeft = handle.includes('w')
    const moveRight = handle.includes('e')
    const moveTop = handle === 'nw' || handle === 'n' || handle === 'ne'
    const moveBottom = handle === 'sw' || handle === 's' || handle === 'se'

    if (fromCenter) {
      // Alt key: resize symmetrically from center
      const centerX = origRect.x + origRect.width / 2
      const centerY = origRect.y + origRect.height / 2
      if (moveRight || moveLeft) {
        const dxAbs = moveRight ? dx : -dx
        width = origRect.width + dxAbs * 2
        x = centerX - width / 2
      }
      if (moveBottom || moveTop) {
        const dyAbs = moveBottom ? dy : -dy
        height = origRect.height + dyAbs * 2
        y = centerY - height / 2
      }
    } else {
      if (moveRight) width = origRect.width + dx
      if (moveLeft) { x = origRect.x + dx; width = origRect.width - dx }
      if (moveBottom) height = origRect.height + dy
      if (moveTop) { y = origRect.y + dy; height = origRect.height - dy }
    }

    if (constrain && origRect.width > 0 && origRect.height > 0) {
      const aspect = origRect.width / origRect.height
      if (handle === 'n' || handle === 's') {
        width = Math.abs(height) * aspect
        x = fromCenter
          ? origRect.x + origRect.width / 2 - width / 2
          : origRect.x + (origRect.width - width) / 2
      } else if (handle === 'e' || handle === 'w') {
        height = Math.abs(width) / aspect
        y = fromCenter
          ? origRect.y + origRect.height / 2 - height / 2
          : origRect.y + (origRect.height - height) / 2
      } else {
        if (Math.abs(dx) > Math.abs(dy)) {
          height = (Math.abs(width) / aspect) * Math.sign(height || 1)
          if (!fromCenter && moveTop) y = origRect.y + origRect.height - Math.abs(height)
          if (fromCenter) y = origRect.y + origRect.height / 2 - Math.abs(height) / 2
        } else {
          width = Math.abs(height) * aspect * Math.sign(width || 1)
          if (!fromCenter && moveLeft) x = origRect.x + origRect.width - Math.abs(width)
          if (fromCenter) x = origRect.x + origRect.width / 2 - Math.abs(width) / 2
        }
      }
    }

    if (width < 0) { x = x + width; width = -width }
    if (height < 0) { y = y + height; height = -height }

    const finalWidth = Math.round(Math.max(1, width))
    const finalHeight = Math.round(Math.max(1, height))
    useEditorStore.getState().actions.updateNode(d.nodeId, {
      x: Math.round(x),
      y: Math.round(y),
      width: finalWidth,
      height: finalHeight,
    })
    // Enforce constraints on children during live resize
    applyConstraints(getGraph(), d.nodeId, origRect.width, origRect.height, finalWidth, finalHeight)
  }

  // ── Auto-layout indicators ─────────────────────────────────

  function computeAutoLayoutIndicator(d: DragMove, cx: number, cy: number) {
    if (!d.autoLayoutParentId) return
    const graph = getGraph()
    const parent = graph.getNode(d.autoLayoutParentId)
    if (!parent || parent.layoutMode === 'NONE') return
    computeAutoLayoutIndicatorForFrame(parent, cx, cy)
  }

  function computeAutoLayoutIndicatorForFrame(parent: SceneNode, cx: number, cy: number) {
    const graph = getGraph()
    const state = useEditorStore.getState()
    const children = graph
      .getChildren(parent.id)
      .filter((c) => c.layoutPositioning !== 'ABSOLUTE' && !state.selectedIds.has(c.id))

    const parentAbs = graph.getAbsolutePosition(parent.id)
    const isRow = parent.layoutMode === 'HORIZONTAL'

    let insertIndex = children.length
    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const childAbs = graph.getAbsolutePosition(child.id)
      const mid = isRow ? childAbs.x + child.width / 2 : childAbs.y + child.height / 2
      const cursor = isRow ? cx : cy
      if (cursor < mid) { insertIndex = i; break }
    }

    let indicatorPos: number
    const crossStart = isRow ? parentAbs.y + parent.paddingTop : parentAbs.x + parent.paddingLeft
    const crossLength = isRow
      ? parent.height - parent.paddingTop - parent.paddingBottom
      : parent.width - parent.paddingLeft - parent.paddingRight

    if (children.length === 0) {
      indicatorPos = isRow ? parentAbs.x + parent.paddingLeft : parentAbs.y + parent.paddingTop
    } else if (insertIndex === 0) {
      const first = children[0]
      const firstAbs = graph.getAbsolutePosition(first.id)
      indicatorPos = isRow ? firstAbs.x - parent.itemSpacing / 2 : firstAbs.y - parent.itemSpacing / 2
    } else if (insertIndex >= children.length) {
      const last = children[children.length - 1]
      const lastAbs = graph.getAbsolutePosition(last.id)
      indicatorPos = isRow ? lastAbs.x + last.width + parent.itemSpacing / 2 : lastAbs.y + last.height + parent.itemSpacing / 2
    } else {
      const prev = children[insertIndex - 1]
      const next = children[insertIndex]
      const prevAbs = graph.getAbsolutePosition(prev.id)
      const nextAbs = graph.getAbsolutePosition(next.id)
      indicatorPos = isRow ? (prevAbs.x + prev.width + nextAbs.x) / 2 : (prevAbs.y + prev.height + nextAbs.y) / 2
    }

    // Convert to real index
    const allChildren = graph.getChildren(parent.id)
    let realIndex = 0
    let filteredCount = 0
    for (const child of allChildren) {
      if (state.selectedIds.has(child.id)) continue
      if (child.layoutPositioning === 'ABSOLUTE') { realIndex++; continue }
      if (filteredCount === insertIndex) break
      filteredCount++
      realIndex++
    }

    state.actions.setLayoutInsertIndicator({
      parentId: parent.id,
      index: realIndex,
      x: isRow ? indicatorPos : crossStart,
      y: isRow ? crossStart : indicatorPos,
      length: crossLength,
      direction: isRow ? 'VERTICAL' : 'HORIZONTAL',
    })
  }

  // ── Touch support ─────────────────────────────────────────

  const touchStateRef = useRef({
    activeTouches: [] as Touch[],
    pinchStartDist: 0,
    pinchStartZoom: 0,
    pinchMidX: 0,
    pinchMidY: 0,
    isTouchDevice: typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches,
  })

  const touchDist = (a: Touch, b: Touch) =>
    Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)

  // ── Safari gesture support ─────────────────────────────────

  const gestureRef = useRef({
    startZoom: 1,
    rafId: 0,
    pending: null as { scale: number; sx: number; sy: number } | null,
  })

  // ── Event listener registration ────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleMouseLeave = () => {
      onMouseUp()
      useEditorStore.getState().actions.setHoveredNode(null)
    }

    const handleTouchStart = (e: TouchEvent) => {
      const ts = touchStateRef.current
      if (!ts.isTouchDevice) return
      e.preventDefault()
      ts.activeTouches = Array.from(e.touches)

      if (ts.activeTouches.length === 2) {
        dragRef.current = null
        const [a, b] = ts.activeTouches
        ts.pinchStartDist = touchDist(a, b)
        ts.pinchStartZoom = useEditorStore.getState().zoom
        const rect = canvas.getBoundingClientRect()
        ts.pinchMidX = (a.clientX + b.clientX) / 2 - rect.left
        ts.pinchMidY = (a.clientY + b.clientY) / 2 - rect.top
      } else if (ts.activeTouches.length === 1) {
        const t = ts.activeTouches[0]
        const state = useEditorStore.getState()
        dragRef.current = {
          type: 'pan',
          startScreenX: t.clientX,
          startScreenY: t.clientY,
          startPanX: state.panX,
          startPanY: state.panY,
        }
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      const ts = touchStateRef.current
      if (!ts.isTouchDevice) return
      e.preventDefault()
      ts.activeTouches = Array.from(e.touches)

      if (ts.activeTouches.length === 2) {
        const [a, b] = ts.activeTouches
        const rect = canvas.getBoundingClientRect()
        const newMidX = (a.clientX + b.clientX) / 2 - rect.left
        const newMidY = (a.clientY + b.clientY) / 2 - rect.top
        const newDist = touchDist(a, b)

        if (ts.pinchStartDist > 0) {
          const state = useEditorStore.getState()
          const scale = newDist / ts.pinchStartDist
          const newZoom = Math.max(0.02, Math.min(256, ts.pinchStartZoom * scale))
          const zoomRatio = newZoom / state.zoom
          const panDx = newMidX - ts.pinchMidX
          const panDy = newMidY - ts.pinchMidY
          useEditorStore.setState({
            panX: ts.pinchMidX - (ts.pinchMidX - state.panX) * zoomRatio + panDx,
            panY: ts.pinchMidY - (ts.pinchMidY - state.panY) * zoomRatio + panDy,
            zoom: newZoom,
          })
        }
        ts.pinchMidX = newMidX
        ts.pinchMidY = newMidY
        useEditorStore.getState().actions.requestRepaint()
      } else if (ts.activeTouches.length === 1 && dragRef.current?.type === 'pan') {
        const t = ts.activeTouches[0]
        const d = dragRef.current
        useEditorStore.setState({
          panX: d.startPanX + (t.clientX - d.startScreenX),
          panY: d.startPanY + (t.clientY - d.startScreenY),
        })
        useEditorStore.getState().actions.requestRepaint()
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      const ts = touchStateRef.current
      if (!ts.isTouchDevice) return
      e.preventDefault()
      ts.activeTouches = Array.from(e.touches)
      if (ts.activeTouches.length === 0) {
        dragRef.current = null
        ts.pinchStartDist = 0
      } else if (ts.activeTouches.length === 1) {
        const t = ts.activeTouches[0]
        const state = useEditorStore.getState()
        dragRef.current = {
          type: 'pan',
          startScreenX: t.clientX,
          startScreenY: t.clientY,
          startPanX: state.panX,
          startPanY: state.panY,
        }
        ts.pinchStartDist = 0
      }
    }

    const flushGesture = () => {
      const gs = gestureRef.current
      gs.rafId = 0
      if (!gs.pending) return
      const { scale, sx, sy } = gs.pending
      gs.pending = null
      const state = useEditorStore.getState()
      const newZoom = Math.max(0.02, Math.min(256, gs.startZoom * scale))
      const zoomRatio = newZoom / state.zoom
      useEditorStore.setState({
        panX: sx - (sx - state.panX) * zoomRatio,
        panY: sy - (sy - state.panY) * zoomRatio,
        zoom: newZoom,
      })
      state.actions.requestRepaint()
    }

    const handleGestureStart = (e: Event) => {
      e.preventDefault()
      gestureRef.current.startZoom = useEditorStore.getState().zoom
    }

    const handleGestureChange = (e: Event) => {
      e.preventDefault()
      const ge = e as GestureEvent
      const rect = canvas.getBoundingClientRect()
      gestureRef.current.pending = {
        scale: ge.scale,
        sx: (ge.clientX ?? rect.width / 2) - rect.left,
        sy: (ge.clientY ?? rect.height / 2) - rect.top,
      }
      if (!gestureRef.current.rafId) {
        gestureRef.current.rafId = requestAnimationFrame(flushGesture)
      }
    }

    const handleGestureEnd = (e: Event) => {
      e.preventDefault()
    }

    canvas.addEventListener('dblclick', onDblClick)
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('mousemove', onMouseMove)
    canvas.addEventListener('mouseup', onMouseUp)
    canvas.addEventListener('mouseleave', handleMouseLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false })
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false })
    canvas.addEventListener('gesturestart', handleGestureStart, { passive: false })
    canvas.addEventListener('gesturechange', handleGestureChange, { passive: false })
    canvas.addEventListener('gestureend', handleGestureEnd, { passive: false })

    return () => {
      canvas.removeEventListener('dblclick', onDblClick)
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onMouseUp)
      canvas.removeEventListener('mouseleave', handleMouseLeave)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchend', handleTouchEnd)
      canvas.removeEventListener('touchcancel', handleTouchEnd)
      canvas.removeEventListener('gesturestart', handleGestureStart)
      canvas.removeEventListener('gesturechange', handleGestureChange)
      canvas.removeEventListener('gestureend', handleGestureEnd)
    }
  }, [canvasRef, onMouseDown, onMouseMove, onMouseUp, onWheel, onDblClick])

  return { cursorRef }
}
