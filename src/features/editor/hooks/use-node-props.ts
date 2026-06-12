import { useMemo } from 'react'

import { getGraph, useEditorStore } from '../store/editor-store'

import type { SceneNode } from '@easel/editor-core'

export function useNodeProps() {
  const selectedIds = useEditorStore((s) => s.selectedIds)
  const sceneVersion = useEditorStore((s) => s.sceneVersion)
  const actions = useEditorStore((s) => s.actions)

  const graph = getGraph()

  const nodes = useMemo(() => {
    void sceneVersion
    return [...selectedIds]
      .map((id) => graph.getNode(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
  }, [selectedIds, sceneVersion, graph])

  const node = nodes[0] ?? null

  function updateProp<K extends keyof SceneNode>(key: K, value: SceneNode[K]) {
    if (!node) return
    actions.updateNode(node.id, { [key]: value } as Partial<SceneNode>)
    actions.requestRender()
  }

  function commitProp<K extends keyof SceneNode>(key: K, _value: SceneNode[K], previous: SceneNode[K]) {
    if (!node) return
    actions.commitNodeUpdate(node.id, { [key]: previous } as Partial<SceneNode>, `Change ${String(key)}`)
  }

  return { node, nodes, updateProp, commitProp, actions, graph }
}
