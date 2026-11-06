// Click targets and pin counts drawn over a diagram's SVG: one per node or
// table on the tab, boxed in the render's own viewBox units from its atlas.
import type { Box, RenderAtlas } from "@coldtea/pr-lens-renderer";
import type { GraphDoc } from "@coldtea/pr-lens-schema";
import { commentTargets, type DiagramTab } from "../shared/diagram-tabs";
import type { StoredComment } from "../shared/schema";

export interface OverlayTarget {
  id: string;
  box: Box;
  label: string;
  kind: string;
  delta: string;
  files: string[];
  /** Comments pinned here that are not outdated. */
  pins: number;
  openPins: number;
}

export function overlayTargets(doc: GraphDoc, tab: DiagramTab, atlas: RenderAtlas, comments: StoredComment[]): OverlayTarget[] {
  const boxes = tab.lens === "data-model" ? atlas.tables : atlas.nodes;
  const parts = new Map<string, { kind: string; delta: string; files: { path: string }[] }>([
    ...doc.nodes.map((node) => [node.id, node] as const),
    ...(doc.dataModel?.tables ?? []).map((table) => [table.id, { ...table, kind: "table" }] as const),
  ]);
  const targets: OverlayTarget[] = [];
  for (const [id, label] of commentTargets(doc, tab)) {
    const box = boxes[id];
    const part = parts.get(id);
    if (!box || !part) continue;
    const pinned = comments.filter((comment) => comment.diagramId === tab.id && comment.nodeId === id && comment.status !== "outdated");
    targets.push({
      id,
      box,
      label,
      kind: part.kind,
      delta: part.delta,
      files: [...new Set(part.files.map((file) => file.path))],
      pins: pinned.length,
      openPins: pinned.filter((comment) => comment.status === "open").length,
    });
  }
  return targets;
}
