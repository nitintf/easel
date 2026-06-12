import type { Color, Fill, Stroke } from '@easel/editor-core'

export {
  SELECTION_COLOR,
  COMPONENT_COLOR,
  SNAP_COLOR,
  ROTATION_HANDLE_OFFSET,
  SNAP_THRESHOLD,
  RULER_SIZE,
  RULER_BG_COLOR,
  RULER_TICK_COLOR,
  RULER_TEXT_COLOR,
  PEN_HANDLE_RADIUS,
  PEN_VERTEX_RADIUS,
  DEFAULT_FONT_SIZE,
  LABEL_FONT_SIZE,
  HANDLE_HALF_SIZE,
} from '@easel/editor-core'

export const HANDLE_SIZE = 6
export const DRAG_DEAD_ZONE = 4
export const PEN_CLOSE_THRESHOLD = 8
export const ROTATION_SNAP_DEGREES = 15
export const ROTATION_HIT_OFFSET = 24
export const DEFAULT_TEXT_WIDTH = 200
export const DEFAULT_TEXT_HEIGHT = 24
export const AUTO_LAYOUT_BREAK_THRESHOLD = 8
export const HANDLE_HIT_RADIUS = 6
export const ROTATION_HIT_RADIUS = 8
export const ZOOM_SENSITIVITY = 0.99

export const DEFAULT_SHAPE_FILL: Fill = {
  type: 'SOLID',
  color: { r: 0.83, g: 0.83, b: 0.83, a: 1 },
  opacity: 1,
  visible: true,
}

export const DEFAULT_FRAME_FILL: Fill = {
  type: 'SOLID',
  color: { r: 1, g: 1, b: 1, a: 1 },
  opacity: 1,
  visible: true,
}

export const SECTION_DEFAULT_FILL: Fill = {
  type: 'SOLID',
  color: { r: 0.37, g: 0.37, b: 0.37, a: 1 },
  opacity: 1,
  visible: true,
}

export const SECTION_DEFAULT_STROKE: Stroke = {
  color: { r: 0.55, g: 0.55, b: 0.55, a: 1 },
  weight: 1,
  opacity: 1,
  visible: true,
  align: 'INSIDE',
}

export const BLACK_FILL: Fill = {
  type: 'SOLID',
  color: { r: 0, g: 0, b: 0, a: 1 },
  opacity: 1,
  visible: true,
}

export const DEFAULT_FILLS: Record<string, Fill> = {
  FRAME: DEFAULT_FRAME_FILL,
  SECTION: SECTION_DEFAULT_FILL,
  RECTANGLE: DEFAULT_SHAPE_FILL,
  ELLIPSE: DEFAULT_SHAPE_FILL,
  POLYGON: DEFAULT_SHAPE_FILL,
  STAR: DEFAULT_SHAPE_FILL,
  LINE: BLACK_FILL,
  TEXT: BLACK_FILL,
}

/** Dark page background — slightly lighter than side panels (#191919) */
export const PAGE_BG_COLOR: Color = { r: 0.165, g: 0.165, b: 0.165, a: 1 }

export const IS_TAURI =
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
