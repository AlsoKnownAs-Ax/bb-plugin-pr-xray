// Click targets drawn over a diagram's SVG: one per node or
// table on the tab, boxed in the render's own viewBox units from its atlas.
import type { Box, RenderAtlas } from "@coldtea/pr-lens-renderer";
import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { commentTargets, type DiagramTab } from "../shared/diagram-tabs";

export type OverlayTarget = {
  id: string;
  box: Box;
  label: string;
  kind: string;
  delta: string;
};

/** The atlas boxes a tab's targets are drawn in. */
const TARGET_BOXES = {
  architecture: (atlas) => atlas.nodes,
  "data-flow": (atlas) => atlas.nodes,
  "data-model": (atlas) => atlas.tables,
} satisfies Record<DiagramTab["lens"], (atlas: RenderAtlas) => Record<string, Box>>;

export function overlayTargets(doc: GraphDoc, tab: DiagramTab, atlas: RenderAtlas): OverlayTarget[] {
  const boxes = TARGET_BOXES[tab.lens](atlas);
  const parts = new Map<string, { kind: string; delta: string }>([
    ...doc.nodes.map((node) => [node.id, node] as const),
    ...(doc.dataModel?.tables ?? []).map((table) => [table.id, { ...table, kind: "table" }] as const),
  ]);
  return [...commentTargets(doc, tab)]
    .filter(([id]) => boxes[id] !== undefined)
    .filter(([id]) => parts.has(id))
    .map(([id, label]) => {
      const part = parts.get(id)!;
      return { id, box: boxes[id]!, label, kind: part.kind, delta: part.delta };
    });
}
