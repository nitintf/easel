import { useEffect, useRef, useCallback } from 'react'


import { getCanvasKit, getGpuBackend } from '../engine/canvaskit'
import { SkiaRenderer } from '../engine/renderer'
import { useEditorStore, getGraph, getTextEditor } from '../store/editor-store'

import type { CanvasKit } from '@easel/editor-core'
import type { RefObject } from 'react'

interface WebGPUContext {
  device: GPUDevice
  deviceContext: unknown
}

interface CanvasKitWebGPU {
  MakeGPUDeviceContext(device: GPUDevice): unknown
  MakeGPUCanvasContext(ctx: unknown, canvas: HTMLCanvasElement, opts?: unknown): unknown
  MakeGPUCanvasSurface(
    ctx: unknown,
    colorSpace?: unknown,
    width?: number,
    height?: number,
  ): ReturnType<CanvasKit['MakeSurface']>
}

function asWebGPU(ck: CanvasKit): CanvasKitWebGPU {
  return ck as unknown as CanvasKitWebGPU
}

async function initWebGPU(ck: CanvasKit): Promise<WebGPUContext | null> {
  if (!('gpu' in navigator)) return null
  const adapter = await navigator.gpu.requestAdapter()
  if (!adapter) return null
  const device = await adapter.requestDevice()
  const deviceContext = (asWebGPU(ck).MakeGPUDeviceContext as ((d: GPUDevice) => unknown) | undefined)?.(device)
  if (!deviceContext) return null
  return { device, deviceContext }
}

export function useCanvas(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const rendererRef = useRef<SkiaRenderer | null>(null)
  const ckRef = useRef<CanvasKit | null>(null)
  const gpuCtxRef = useRef<WebGPUContext | null>(null)
  const destroyedRef = useRef(false)
  const lastRenderVersionRef = useRef(-1)
  const lastSelectedIdsRef = useRef<Set<string> | null>(null)
  const resizeRafRef = useRef(0)
  const rafIdRef = useRef(0)

  const createSurface = useCallback((canvas: HTMLCanvasElement) => {
    const ck = ckRef.current
    if (!ck) return

    rendererRef.current?.destroy()
    rendererRef.current = null

    const dpr = window.devicePixelRatio || 1
    const w = canvas.clientWidth
    const h = canvas.clientHeight
    canvas.width = w * dpr
    canvas.height = h * dpr

    let surface
    if (getGpuBackend() === 'webgpu' && gpuCtxRef.current) {
      const gpu = asWebGPU(ck)
      const canvasCtx = gpu.MakeGPUCanvasContext(gpuCtxRef.current.deviceContext, canvas)
      surface = gpu.MakeGPUCanvasSurface(canvasCtx, ck.ColorSpace.SRGB, canvas.width, canvas.height)
      if (!surface) {
        console.error('Failed to create WebGPU surface')
        return
      }
    } else {
      surface = ck.MakeWebGLCanvasSurface(canvas)
      if (!surface) {
        console.error('Failed to create WebGL surface')
        return
      }
    }

    const renderer = new SkiaRenderer(ck, surface)
    rendererRef.current = renderer
    useEditorStore.getState().actions.setCanvasKit(ck, renderer)
    void renderer.loadFonts().then(() => renderNow())
    renderNow()
    canvas.dataset.ready = '1'
  }, [])

  const renderNow = useCallback(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    const state = useEditorStore.getState()
    const graph = getGraph()

    renderer.dpr = window.devicePixelRatio || 1
    renderer.panX = state.panX
    renderer.panY = state.panY
    renderer.zoom = state.zoom
    renderer.viewportWidth = canvasRef.current?.clientWidth ?? 0
    renderer.viewportHeight = canvasRef.current?.clientHeight ?? 0
    renderer.showRulers = false
    renderer.pageColor = state.pageColor
    renderer.pageId = state.currentPageId
    renderer.render(
      graph,
      state.selectedIds,
      {
        hoveredNodeId: state.hoveredNodeId,
        editingTextId: state.editingTextId,
        textEditor: getTextEditor(),
        marquee: state.marquee,
        snapGuides: state.snapGuides,
        rotationPreview: state.rotationPreview,
        dropTargetId: state.dropTargetId,
        layoutInsertIndicator: state.layoutInsertIndicator,
        penState: state.penState
          ? {
              ...state.penState,
              cursorX: state.penCursorX ?? undefined,
              cursorY: state.penCursorY ?? undefined,
            }
          : null,
        vectorEditState: state.vectorEditId
          ? {
              nodeId: state.vectorEditId,
              selectedVertex: state.vectorEditSelectedVertex,
            }
          : null,
      },
      state.sceneVersion,
    )
    lastRenderVersionRef.current = state.renderVersion
    lastSelectedIdsRef.current = state.selectedIds
  }, [canvasRef])

  // Init CanvasKit
  useEffect(() => {
    destroyedRef.current = false

    async function init() {
      const canvas = canvasRef.current
      if (!canvas || destroyedRef.current) return

      const ck = await getCanvasKit()
      ckRef.current = ck
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- ref mutated in cleanup
      if (destroyedRef.current) return

      if (getGpuBackend() === 'webgpu') {
        gpuCtxRef.current = await initWebGPU(ck)
        if (!gpuCtxRef.current) {
          console.warn('WebGPU init failed')
          return
        }
      }

      await new Promise((r) => requestAnimationFrame(r))
      createSurface(canvas)

      // Dismiss splash screen
      const splash = document.getElementById('splash')
      if (splash) {
        splash.classList.add('fade-out')
        setTimeout(() => splash.remove(), 400)
      }
    }

    void init()

    return () => {
      destroyedRef.current = true
      cancelAnimationFrame(rafIdRef.current)
      cancelAnimationFrame(resizeRafRef.current)
      rendererRef.current?.destroy()
    }
  }, [canvasRef, createSurface])

  // rAF render loop
  useEffect(() => {
    function tick() {
      if (destroyedRef.current) return
      const state = useEditorStore.getState()
      const versionChanged = state.renderVersion !== lastRenderVersionRef.current
      const selectionChanged = state.selectedIds !== lastSelectedIdsRef.current
      if (versionChanged || selectionChanged) {
        renderNow()
      }
      rafIdRef.current = requestAnimationFrame(tick)
    }
    rafIdRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [renderNow])

  // ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const observer = new ResizeObserver(() => {
      if (!ckRef.current || resizeRafRef.current) return
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = 0
        if (canvasRef.current) createSurface(canvasRef.current)
      })
    })
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [canvasRef, createSurface])

  const hitTestSectionTitle = useCallback(
    (canvasX: number, canvasY: number) => {
      return rendererRef.current?.hitTestSectionTitle(getGraph(), canvasX, canvasY) ?? null
    },
    [],
  )

  const hitTestComponentLabel = useCallback(
    (canvasX: number, canvasY: number) => {
      return rendererRef.current?.hitTestComponentLabel(getGraph(), canvasX, canvasY) ?? null
    },
    [],
  )

  return { hitTestSectionTitle, hitTestComponentLabel }
}

