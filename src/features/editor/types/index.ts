import type { NodeType, VectorVertex, VectorSegment, SnapGuide, Color, Rect } from '@easel/editor-core'

// ─── Tool types ──────────────────────────────────────────────────

export type Tool =
  | 'SELECT'
  | 'FRAME'
  | 'SECTION'
  | 'RECTANGLE'
  | 'ELLIPSE'
  | 'LINE'
  | 'POLYGON'
  | 'STAR'
  | 'TEXT'
  | 'PEN'
  | 'HAND'

export interface ToolDef {
  key: Tool
  label: string
  shortcut: string
  flyout?: Tool[]
}

export const TOOLS: ToolDef[] = [
  { key: 'SELECT', label: 'Move', shortcut: 'V' },
  { key: 'FRAME', label: 'Frame', shortcut: 'F', flyout: ['FRAME', 'SECTION'] },
  {
    key: 'RECTANGLE',
    label: 'Rectangle',
    shortcut: 'R',
    flyout: ['RECTANGLE', 'LINE', 'ELLIPSE', 'POLYGON', 'STAR'],
  },
  { key: 'PEN', label: 'Pen', shortcut: 'P' },
  { key: 'TEXT', label: 'Text', shortcut: 'T' },
  { key: 'HAND', label: 'Hand', shortcut: 'H' },
]

export const TOOL_SHORTCUTS: Record<string, Tool> = {
  v: 'SELECT',
  f: 'FRAME',
  s: 'SECTION',
  r: 'RECTANGLE',
  o: 'ELLIPSE',
  l: 'LINE',
  t: 'TEXT',
  p: 'PEN',
  h: 'HAND',
}

export const TOOL_TO_NODE: Partial<Record<Tool, NodeType>> = {
  FRAME: 'FRAME',
  SECTION: 'SECTION',
  RECTANGLE: 'RECTANGLE',
  ELLIPSE: 'ELLIPSE',
  LINE: 'LINE',
  POLYGON: 'POLYGON',
  STAR: 'STAR',
  TEXT: 'TEXT',
}

// ─── Drag state machine ─────────────────────────────────────────

export type HandlePosition = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export interface DragDraw {
  type: 'draw'
  startX: number
  startY: number
  nodeId: string
}

export interface DragMove {
  type: 'move'
  startX: number
  startY: number
  originals: Map<string, { x: number; y: number }>
  duplicated?: boolean
  autoLayoutParentId?: string
  brokeFromAutoLayout?: boolean
}

export interface DragPan {
  type: 'pan'
  startScreenX: number
  startScreenY: number
  startPanX: number
  startPanY: number
}

export interface DragResize {
  type: 'resize'
  handle: HandlePosition
  startX: number
  startY: number
  origRect: Rect
  nodeId: string
}

export interface DragMarquee {
  type: 'marquee'
  startX: number
  startY: number
}

export interface DragRotate {
  type: 'rotate'
  nodeId: string
  centerX: number
  centerY: number
  startAngle: number
  origRotation: number
}

export interface DragPen {
  type: 'pen-drag'
  startX: number
  startY: number
}

export interface DragTextSelect {
  type: 'text-select'
  startX: number
  startY: number
}

export interface DragVectorVertex {
  type: 'vector-vertex'
  nodeId: string
  vertexIndex: number
  startX: number
  startY: number
  origX: number
  origY: number
}

export interface DragVectorTangent {
  type: 'vector-tangent'
  nodeId: string
  segmentIndex: number
  which: 'start' | 'end'
  startX: number
  startY: number
  origTx: number
  origTy: number
}

export type DragState =
  | DragDraw
  | DragMove
  | DragPan
  | DragResize
  | DragMarquee
  | DragRotate
  | DragPen
  | DragTextSelect
  | DragVectorVertex
  | DragVectorTangent

// ─── Page viewport ──────────────────────────────────────────────

export interface PageViewport {
  panX: number
  panY: number
  zoom: number
  pageColor: Color
}

// ─── Layout insert indicator ────────────────────────────────────

export interface LayoutInsertIndicator {
  parentId: string
  index: number
  x: number
  y: number
  length: number
  direction: 'HORIZONTAL' | 'VERTICAL'
}

// ─── Pen state ──────────────────────────────────────────────────

export interface PenState {
  vertices: VectorVertex[]
  segments: VectorSegment[]
  dragTangent: { x: number; y: number } | null
  closingToFirst: boolean
}

// ─── Re-exports ─────────────────────────────────────────────────

export type { SnapGuide, Color, Rect }
export type { SceneNode, NodeType, Fill, Stroke, LayoutMode, ExportFormat } from '@easel/editor-core'
