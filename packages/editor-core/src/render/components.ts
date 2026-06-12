import { node, type BaseProps, type TextProps, type TreeNode } from './tree'

export function Frame(props: BaseProps): TreeNode {
  return node('frame', props as Record<string, unknown>)
}

export function Text(props: TextProps): TreeNode {
  return node('text', props as Record<string, unknown>)
}

export function Rectangle(props: BaseProps): TreeNode {
  return node('rectangle', props as Record<string, unknown>)
}

export function Ellipse(props: BaseProps): TreeNode {
  return node('ellipse', props as Record<string, unknown>)
}

export function Line(props: BaseProps): TreeNode {
  return node('line', props as Record<string, unknown>)
}

export function Star(props: BaseProps & { points?: number; innerRadius?: number }): TreeNode {
  return node('star', props as Record<string, unknown>)
}

export function Polygon(props: BaseProps & { pointCount?: number }): TreeNode {
  return node('polygon', props as Record<string, unknown>)
}

export function Vector(props: BaseProps): TreeNode {
  return node('vector', props as Record<string, unknown>)
}

export function Group(props: BaseProps): TreeNode {
  return node('group', props as Record<string, unknown>)
}

export function Section(props: BaseProps): TreeNode {
  return node('section', props as Record<string, unknown>)
}

export const View = Frame
export const Rect = Rectangle
export const Component = Frame
export const Instance = Frame
export const Page = Frame

export const INTRINSIC_ELEMENTS = [
  'frame',
  'text',
  'rectangle',
  'ellipse',
  'line',
  'star',
  'polygon',
  'vector',
  'group',
  'section'
] as const
