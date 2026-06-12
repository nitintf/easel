import Yoga, {
  Align,
  Direction,
  FlexDirection,
  Gutter,
  Justify,
  Edge,
  Wrap,
  type Node as YogaNode,
} from "yoga-layout";

import type { SceneGraph, SceneNode } from "./scene-graph";

export function computeLayout(graph: SceneGraph, frameId: string): void {
  const frame = graph.getNode(frameId);
  if (!frame || frame.layoutMode === "NONE") return;

  const yogaRoot = buildYogaTree(graph, frame);
  yogaRoot.calculateLayout(undefined, undefined, Direction.LTR);
  applyYogaLayout(graph, frame, yogaRoot);
  freeYogaTree(yogaRoot);
}

export function computeAllLayouts(graph: SceneGraph): void {
  const visited = new Set<string>();
  computeLayoutsBottomUp(graph, graph.rootId, visited);
}

function computeLayoutsBottomUp(graph: SceneGraph, nodeId: string, visited: Set<string>): void {
  const node = graph.getNode(nodeId);
  if (!node || visited.has(nodeId)) return;
  visited.add(nodeId);

  for (const childId of node.childIds) {
    computeLayoutsBottomUp(graph, childId, visited);
  }

  if (node.layoutMode !== "NONE") {
    computeLayout(graph, nodeId);
  }
}

function buildYogaTree(graph: SceneGraph, frame: SceneNode): YogaNode {
  const root = Yoga.Node.create();

  if (frame.primaryAxisSizing === "FIXED") {
    if (frame.layoutMode === "HORIZONTAL") root.setWidth(frame.width);
    else root.setHeight(frame.height);
  }
  if (frame.counterAxisSizing === "FIXED") {
    if (frame.layoutMode === "HORIZONTAL") root.setHeight(frame.height);
    else root.setWidth(frame.width);
  }

  root.setFlexDirection(
    frame.layoutMode === "HORIZONTAL" ? FlexDirection.Row : FlexDirection.Column,
  );
  root.setFlexWrap(frame.layoutWrap === "WRAP" ? Wrap.Wrap : Wrap.NoWrap);
  root.setJustifyContent(mapJustify(frame.primaryAxisAlign));
  root.setAlignItems(mapAlign(frame.counterAxisAlign));

  root.setPadding(Edge.Top, frame.paddingTop);
  root.setPadding(Edge.Right, frame.paddingRight);
  root.setPadding(Edge.Bottom, frame.paddingBottom);
  root.setPadding(Edge.Left, frame.paddingLeft);

  root.setGap(
    Gutter.Column,
    frame.layoutMode === "HORIZONTAL" ? frame.itemSpacing : frame.counterAxisSpacing,
  );
  root.setGap(
    Gutter.Row,
    frame.layoutMode === "HORIZONTAL" ? frame.counterAxisSpacing : frame.itemSpacing,
  );

  const children = graph.getChildren(frame.id);
  for (const child of children) {
    if (child.layoutPositioning === "ABSOLUTE") continue;

    const yogaChild = Yoga.Node.create();

    if (child.layoutMode !== "NONE") {
      configureChildAsAutoLayout(yogaChild, child, frame, graph);
    } else {
      configureChildAsLeaf(yogaChild, child, frame);
    }

    root.insertChild(yogaChild, root.getChildCount());
  }

  return root;
}

function configureChildAsAutoLayout(
  yogaChild: YogaNode,
  child: SceneNode,
  parent: SceneNode,
  graph: SceneGraph,
): void {
  const isParentRow = parent.layoutMode === "HORIZONTAL";
  const isChildRow = child.layoutMode === "HORIZONTAL";

  const widthSizing = isChildRow ? child.primaryAxisSizing : child.counterAxisSizing;
  const heightSizing = isChildRow ? child.counterAxisSizing : child.primaryAxisSizing;

  if (isParentRow) {
    setSizing(yogaChild, "width", widthSizing, child.width, child.layoutGrow);
    setSizing(yogaChild, "height", heightSizing, child.height, 0);
  } else {
    setSizing(yogaChild, "width", widthSizing, child.width, 0);
    setSizing(yogaChild, "height", heightSizing, child.height, child.layoutGrow);
  }

  if (child.layoutAlignSelf === "STRETCH") {
    yogaChild.setAlignSelf(Align.Stretch);
  }

  yogaChild.setFlexDirection(
    child.layoutMode === "HORIZONTAL" ? FlexDirection.Row : FlexDirection.Column,
  );
  yogaChild.setFlexWrap(child.layoutWrap === "WRAP" ? Wrap.Wrap : Wrap.NoWrap);
  yogaChild.setJustifyContent(mapJustify(child.primaryAxisAlign));
  yogaChild.setAlignItems(mapAlign(child.counterAxisAlign));

  yogaChild.setPadding(Edge.Top, child.paddingTop);
  yogaChild.setPadding(Edge.Right, child.paddingRight);
  yogaChild.setPadding(Edge.Bottom, child.paddingBottom);
  yogaChild.setPadding(Edge.Left, child.paddingLeft);

  yogaChild.setGap(
    Gutter.Column,
    child.layoutMode === "HORIZONTAL" ? child.itemSpacing : child.counterAxisSpacing,
  );
  yogaChild.setGap(
    Gutter.Row,
    child.layoutMode === "HORIZONTAL" ? child.counterAxisSpacing : child.itemSpacing,
  );

  const grandchildren = graph.getChildren(child.id);
  for (const gc of grandchildren) {
    if (gc.layoutPositioning === "ABSOLUTE") continue;
    const yogaGC = Yoga.Node.create();
    if (gc.layoutMode !== "NONE") {
      configureChildAsAutoLayout(yogaGC, gc, child, graph);
    } else {
      configureChildAsLeaf(yogaGC, gc, child);
    }
    yogaChild.insertChild(yogaGC, yogaChild.getChildCount());
  }
}

function configureChildAsLeaf(yogaChild: YogaNode, child: SceneNode, parent: SceneNode): void {
  const isRow = parent.layoutMode === "HORIZONTAL";
  const stretchCross = child.layoutAlignSelf === "STRETCH" || parent.counterAxisAlign === "STRETCH";

  if (child.layoutGrow > 0) {
    yogaChild.setFlexGrow(child.layoutGrow);
    if (!stretchCross) {
      if (isRow) yogaChild.setHeight(child.height);
      else yogaChild.setWidth(child.width);
    }
  } else {
    if (isRow) {
      yogaChild.setWidth(child.width);
      if (!stretchCross) yogaChild.setHeight(child.height);
    } else {
      yogaChild.setHeight(child.height);
      if (!stretchCross) yogaChild.setWidth(child.width);
    }
  }

  if (child.layoutAlignSelf === "STRETCH") {
    yogaChild.setAlignSelf(Align.Stretch);
  }
}

function setSizing(
  yogaNode: YogaNode,
  axis: "width" | "height",
  sizing: string,
  fixedValue: number,
  grow: number,
): void {
  if (grow > 0) {
    yogaNode.setFlexGrow(grow);
    yogaNode.setFlexShrink(1);
    return;
  }

  switch (sizing) {
    case "FIXED":
      if (axis === "width") yogaNode.setWidth(fixedValue);
      else yogaNode.setHeight(fixedValue);
      break;
    case "HUG":
      break;
    case "FILL":
      yogaNode.setFlexGrow(1);
      yogaNode.setFlexShrink(1);
      break;
  }
}

function applyYogaLayout(graph: SceneGraph, frame: SceneNode, yogaNode: YogaNode): void {
  if (frame.primaryAxisSizing === "HUG" || frame.counterAxisSizing === "HUG") {
    const computedW = yogaNode.getComputedWidth();
    const computedH = yogaNode.getComputedHeight();
    const updates: Partial<SceneNode> = {};

    if (frame.primaryAxisSizing === "HUG") {
      if (frame.layoutMode === "HORIZONTAL") updates.width = computedW;
      else updates.height = computedH;
    }
    if (frame.counterAxisSizing === "HUG") {
      if (frame.layoutMode === "HORIZONTAL") updates.height = computedH;
      else updates.width = computedW;
    }

    graph.updateNode(frame.id, updates);
  }

  const children = graph.getChildren(frame.id);
  let yogaIndex = 0;
  for (const child of children) {
    if (child.layoutPositioning === "ABSOLUTE") continue;

    const yogaChild = yogaNode.getChild(yogaIndex);
    yogaIndex++;

    graph.updateNode(child.id, {
      x: yogaChild.getComputedLeft(),
      y: yogaChild.getComputedTop(),
      width: yogaChild.getComputedWidth(),
      height: yogaChild.getComputedHeight(),
    });

    if (child.layoutMode !== "NONE") {
      applyYogaLayout(graph, child, yogaChild);
    }
  }
}

function freeYogaTree(node: YogaNode): void {
  for (let i = node.getChildCount() - 1; i >= 0; i--) {
    freeYogaTree(node.getChild(i));
  }
  node.free();
}

/**
 * Enforce horizontal/vertical constraints on children of a frame
 * after that frame has been resized. Only applies to children that
 * are NOT auto-layout-managed (i.e. parent.layoutMode === 'NONE'
 * or child.layoutPositioning === 'ABSOLUTE').
 */
export function applyConstraints(
  graph: SceneGraph,
  parentId: string,
  oldWidth: number,
  oldHeight: number,
  newWidth: number,
  newHeight: number,
): void {
  if (oldWidth === newWidth && oldHeight === newHeight) return;
  const parent = graph.getNode(parentId);
  if (!parent) return;

  const children = graph.getChildren(parentId);
  for (const child of children) {
    // Skip auto-layout managed children
    if (parent.layoutMode !== "NONE" && child.layoutPositioning !== "ABSOLUTE") continue;

    const updates: Record<string, number> = {};

    // Horizontal constraint
    applyAxisConstraint(
      child.horizontalConstraint,
      child.x,
      child.width,
      oldWidth,
      newWidth,
      updates,
      "x",
      "width",
    );

    // Vertical constraint
    applyAxisConstraint(
      child.verticalConstraint,
      child.y,
      child.height,
      oldHeight,
      newHeight,
      updates,
      "y",
      "height",
    );

    if (Object.keys(updates).length > 0) {
      graph.updateNode(child.id, updates as Partial<SceneNode>);
    }
  }
}

function applyAxisConstraint(
  constraint: string,
  pos: number,
  size: number,
  oldParentSize: number,
  newParentSize: number,
  updates: Record<string, number>,
  posKey: string,
  sizeKey: string,
): void {
  if (oldParentSize === newParentSize) return;

  switch (constraint) {
    case "MIN":
      // Keep distance from start edge fixed — position stays the same
      break;
    case "CENTER": {
      // Keep centered relative to parent
      const center = pos + size / 2;
      const ratio = oldParentSize > 0 ? center / oldParentSize : 0.5;
      updates[posKey] = Math.round(ratio * newParentSize - size / 2);
      break;
    }
    case "MAX": {
      // Keep distance from end edge fixed
      const distFromEnd = oldParentSize - (pos + size);
      updates[posKey] = Math.round(newParentSize - distFromEnd - size);
      break;
    }
    case "STRETCH": {
      // Keep both edge distances fixed — grow/shrink with parent
      const distFromStart = pos;
      const distFromEnd = oldParentSize - (pos + size);
      const newSize = newParentSize - distFromStart - distFromEnd;
      updates[sizeKey] = Math.round(Math.max(1, newSize));
      break;
    }
    case "SCALE": {
      // Scale proportionally with parent
      const ratio = oldParentSize > 0 ? newParentSize / oldParentSize : 1;
      updates[posKey] = Math.round(pos * ratio);
      updates[sizeKey] = Math.round(Math.max(1, size * ratio));
      break;
    }
  }
}

function mapJustify(align: string): Justify {
  switch (align) {
    case "CENTER":
      return Justify.Center;
    case "MAX":
      return Justify.FlexEnd;
    case "SPACE_BETWEEN":
      return Justify.SpaceBetween;
    default:
      return Justify.FlexStart;
  }
}

function mapAlign(align: string): Align {
  switch (align) {
    case "CENTER":
      return Align.Center;
    case "MAX":
      return Align.FlexEnd;
    case "STRETCH":
      return Align.Stretch;
    case "BASELINE":
      return Align.Baseline;
    default:
      return Align.FlexStart;
  }
}
