import type {
  HandleMirroring,
  VectorNetwork,
  VectorRegion,
  VectorSegment,
  VectorVertex,
  WindingRule
} from './scene-graph'
import type { CanvasKit, Path } from 'canvaskit-wasm'

// --- vectorNetworkBlob binary format ---
// Header:  [numVertices:u32, numSegments:u32, numRegions:u32]  (12 bytes)
// Vertex:  [styleOverrideIdx:u32, x:f32, y:f32]               (12 bytes)
// Segment: [styleOverrideIdx:u32, start:u32, tsX:f32, tsY:f32, end:u32, teX:f32, teY:f32]  (28 bytes)
// Region:  [windingRule:u32, numLoops:u32, {numSegs:u32, segIdx...}... ]  (variable)

interface StyleOverride {
  styleID: number
  handleMirroring?: string
}

export function decodeVectorNetworkBlob(
  data: Uint8Array,
  styleOverrideTable?: StyleOverride[]
): VectorNetwork {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  let o = 0

  const nV = view.getUint32(o, true)
  o += 4
  const nS = view.getUint32(o, true)
  o += 4
  const nR = view.getUint32(o, true)
  o += 4

  const styleMap = new Map<number, StyleOverride>()
  if (styleOverrideTable) {
    for (const entry of styleOverrideTable) {
      styleMap.set(entry.styleID, entry)
    }
  }

  const vertices: VectorVertex[] = []
  for (let i = 0; i < nV; i++) {
    const styleIdx = view.getUint32(o, true)
    o += 4
    const x = view.getFloat32(o, true)
    o += 4
    const y = view.getFloat32(o, true)
    o += 4

    const override = styleMap.get(styleIdx)
    vertices.push({
      x,
      y,
      handleMirroring: (override?.handleMirroring as HandleMirroring) ?? 'NONE'
    })
  }

  const segments: VectorSegment[] = []
  for (let i = 0; i < nS; i++) {
    o += 4 // styleOverrideIdx (unused for segments currently)
    const start = view.getUint32(o, true)
    o += 4
    const tsX = view.getFloat32(o, true)
    o += 4
    const tsY = view.getFloat32(o, true)
    o += 4
    const end = view.getUint32(o, true)
    o += 4
    const teX = view.getFloat32(o, true)
    o += 4
    const teY = view.getFloat32(o, true)
    o += 4

    segments.push({
      start,
      end,
      tangentStart: { x: tsX, y: tsY },
      tangentEnd: { x: teX, y: teY }
    })
  }

  const regions: VectorRegion[] = []
  for (let i = 0; i < nR; i++) {
    const windingRuleU32 = view.getUint32(o, true)
    o += 4
    const windingRule: WindingRule = windingRuleU32 === 0 ? 'EVENODD' : 'NONZERO'
    const numLoops = view.getUint32(o, true)
    o += 4
    const loops: number[][] = []
    for (let j = 0; j < numLoops; j++) {
      const numSegs = view.getUint32(o, true)
      o += 4
      const loop: number[] = []
      for (let k = 0; k < numSegs; k++) {
        loop.push(view.getUint32(o, true))
        o += 4
      }
      loops.push(loop)
    }
    regions.push({ windingRule, loops })
  }

  return { vertices, segments, regions }
}

export function encodeVectorNetworkBlob(network: VectorNetwork): Uint8Array {
  const { vertices, segments, regions } = network

  let regionBytes = 0
  for (const region of regions) {
    regionBytes += 8 // windingRule + numLoops
    for (const loop of region.loops) {
      regionBytes += 4 + loop.length * 4 // numSegs + indices
    }
  }

  const totalBytes = 12 + vertices.length * 12 + segments.length * 28 + regionBytes
  const buf = new ArrayBuffer(totalBytes)
  const view = new DataView(buf)
  let o = 0

  view.setUint32(o, vertices.length, true)
  o += 4
  view.setUint32(o, segments.length, true)
  o += 4
  view.setUint32(o, regions.length, true)
  o += 4

  for (const v of vertices) {
    view.setUint32(o, 0, true)
    o += 4 // styleOverrideIdx (TODO: encode handleMirroring)
    view.setFloat32(o, v.x, true)
    o += 4
    view.setFloat32(o, v.y, true)
    o += 4
  }

  for (const seg of segments) {
    view.setUint32(o, 0, true)
    o += 4 // styleOverrideIdx
    view.setUint32(o, seg.start, true)
    o += 4
    view.setFloat32(o, seg.tangentStart.x, true)
    o += 4
    view.setFloat32(o, seg.tangentStart.y, true)
    o += 4
    view.setUint32(o, seg.end, true)
    o += 4
    view.setFloat32(o, seg.tangentEnd.x, true)
    o += 4
    view.setFloat32(o, seg.tangentEnd.y, true)
    o += 4
  }

  for (const region of regions) {
    view.setUint32(o, region.windingRule === 'EVENODD' ? 0 : 1, true)
    o += 4
    view.setUint32(o, region.loops.length, true)
    o += 4
    for (const loop of region.loops) {
      view.setUint32(o, loop.length, true)
      o += 4
      for (const segIdx of loop) {
        view.setUint32(o, segIdx, true)
        o += 4
      }
    }
  }

  return new Uint8Array(buf)
}

export function vectorNetworkToPath(ck: CanvasKit, network: VectorNetwork): Path {
  const path = new ck.Path()
  const { vertices, segments, regions } = network

  if (regions.length > 0) {
    for (const region of regions) {
      for (const loop of region.loops) {
        addLoopToPath(path, loop, segments, vertices)
      }
      path.setFillType(region.windingRule === 'EVENODD' ? ck.FillType.EvenOdd : ck.FillType.Winding)
    }
  } else {
    // No regions — draw all segments as open paths
    const visited = new Set<number>()
    const chains = buildChains(segments, vertices.length)

    for (const chain of chains) {
      if (chain.length === 0) continue
      const firstSeg = segments[chain[0]]
      path.moveTo(vertices[firstSeg.start].x, vertices[firstSeg.start].y)

      for (const segIdx of chain) {
        visited.add(segIdx)
        addSegmentToPath(path, segments[segIdx], vertices)
      }
    }

    // Any remaining disconnected segments
    for (let i = 0; i < segments.length; i++) {
      if (visited.has(i)) continue
      const seg = segments[i]
      path.moveTo(vertices[seg.start].x, vertices[seg.start].y)
      addSegmentToPath(path, seg, vertices)
    }
  }

  return path
}

function addLoopToPath(
  path: Path,
  loop: number[],
  segments: VectorSegment[],
  vertices: VectorVertex[]
): void {
  if (loop.length === 0) return

  const firstSeg = segments[loop[0]]
  path.moveTo(vertices[firstSeg.start].x, vertices[firstSeg.start].y)

  for (const segIdx of loop) {
    addSegmentToPath(path, segments[segIdx], vertices)
  }

  const lastSeg = segments[loop[loop.length - 1]]
  if (lastSeg.end === firstSeg.start) {
    path.close()
  }
}

function addSegmentToPath(path: Path, seg: VectorSegment, vertices: VectorVertex[]): void {
  const start = vertices[seg.start]
  const end = vertices[seg.end]
  const ts = seg.tangentStart
  const te = seg.tangentEnd

  const isLine = ts.x === 0 && ts.y === 0 && te.x === 0 && te.y === 0
  if (isLine) {
    path.lineTo(end.x, end.y)
  } else {
    // Cubic bezier: control points are tangent offsets from start/end
    path.cubicTo(start.x + ts.x, start.y + ts.y, end.x + te.x, end.y + te.y, end.x, end.y)
  }
}

function buildChains(segments: VectorSegment[], _vertexCount: number): number[][] {
  if (segments.length === 0) return []

  // Build adjacency: for each vertex, which segments connect to it
  const adj = new Map<number, number[]>()
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    if (!adj.has(s.start)) adj.set(s.start, [])
    if (!adj.has(s.end)) adj.set(s.end, [])
    adj.get(s.start)?.push(i)
    adj.get(s.end)?.push(i)
  }

  const visited = new Set<number>()
  const chains: number[][] = []

  // Start from degree-1 vertices (endpoints) or any unvisited
  const degree1 = [...adj.entries()].filter(([, segs]) => segs.length === 1).map(([v]) => v)

  const startVertices = degree1.length > 0 ? degree1 : [segments[0].start]

  for (const startVertex of startVertices) {
    let current = startVertex
    const chain: number[] = []

    while (true) {
      const segs = adj.get(current)
      if (!segs) break

      const nextSeg = segs.find((s) => !visited.has(s))
      if (nextSeg === undefined) break

      visited.add(nextSeg)
      chain.push(nextSeg)

      const seg = segments[nextSeg]
      current = seg.start === current ? seg.end : seg.start
    }

    if (chain.length > 0) chains.push(chain)
  }

  return chains
}

export function computeVectorBounds(network: VectorNetwork): {
  x: number
  y: number
  width: number
  height: number
} {
  if (network.vertices.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const v of network.vertices) {
    minX = Math.min(minX, v.x)
    minY = Math.min(minY, v.y)
    maxX = Math.max(maxX, v.x)
    maxY = Math.max(maxY, v.y)
  }

  // Also consider bezier control points for tighter bounds
  for (const seg of network.segments) {
    const start = network.vertices[seg.start]
    const end = network.vertices[seg.end]
    const cp1x = start.x + seg.tangentStart.x
    const cp1y = start.y + seg.tangentStart.y
    const cp2x = end.x + seg.tangentEnd.x
    const cp2y = end.y + seg.tangentEnd.y

    minX = Math.min(minX, cp1x, cp2x)
    minY = Math.min(minY, cp1y, cp2y)
    maxX = Math.max(maxX, cp1x, cp2x)
    maxY = Math.max(maxY, cp1y, cp2y)
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
