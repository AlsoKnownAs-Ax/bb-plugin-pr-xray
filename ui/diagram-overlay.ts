// Click targets and pin counts drawn over a diagram's SVG: one per node or
// table on the tab, boxed in the render's own viewBox units from its atlas.
import type { Box, RenderAtlas } from "@coldtea/pr-lens-renderer";
import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { commentTargets, type DiagramTab } from "../shared/diagram-tabs";
import type { StoredComment } from "../shared/schema";

export type OverlayTarget = {
  id: string;
  box: Box;
  label: string;
  kind: string;
  delta: string;
  files: string[];
  /** Comments pinned here that are not outdated. */
  pins: number;
  openPins: number;
};

/** The atlas boxes a tab's comment targets are drawn in. */
const TARGET_BOXES = {
  architecture: (atlas) => atlas.nodes,
  "data-flow": (atlas) => atlas.nodes,
  "data-model": (atlas) => atlas.tables,
} satisfies Record<DiagramTab["lens"], (atlas: RenderAtlas) => Record<string, Box>>;

export function overlayTargets(doc: GraphDoc, tab: DiagramTab, atlas: RenderAtlas, comments: StoredComment[]): OverlayTarget[] {
  const boxes = TARGET_BOXES[tab.lens](atlas);
  const parts = new Map<string, { kind: string; delta: string; files: { path: string }[] }>([
    ...doc.nodes.map((node) => [node.id, node] as const),
    ...(doc.dataModel?.tables ?? []).map((table) => [table.id, { ...table, kind: "table" }] as const),
  ]);
  return [...commentTargets(doc, tab)]
    .filter(([id]) => boxes[id] !== undefined)
    .filter(([id]) => parts.has(id))
    .map(([id, label]) => {
      const part = parts.get(id)!;
      const pinned = comments
        .filter((comment) => comment.diagramId === tab.id)
        .filter((comment) => comment.nodeId === id)
        .filter((comment) => comment.status !== "outdated");
      return {
        id,
        box: boxes[id]!,
        label,
        kind: part.kind,
        delta: part.delta,
        files: [...new Set(part.files.map((file) => file.path))],
        pins: pinned.length,
        openPins: pinned.filter((comment) => comment.status === "open").length,
      };
    });
}
