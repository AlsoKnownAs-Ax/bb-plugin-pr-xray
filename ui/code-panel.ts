// What the Code panel shows: the PR's hunks behind a walkthrough step, a
// diagram part, a cited file or a group, in PR order.
import type { GraphDoc, GraphNode, WalkthroughStep } from "@coldtea/pr-lens-schema";
import type { Hunk, PrDetails, PrFile } from "../shared/schema";
import { hunkRange } from "./diff-utils";

/** A place in the code a diagram part names; no lines means the whole file. */
export type FileRef = GraphNode["files"][number];
export type CodeFile = { file: PrFile; hunks: Hunk[] };
type Pr = Pick<PrDetails, "files" | "hunks">;

/** The files of every part the step focuses, then its file cites. `flow` is the flow its stage shows. */
export function stepRefs(doc: GraphDoc, step: WalkthroughStep, flow?: string): FileRef[] {
  const cites = (step.detail?.cites ?? []).flatMap(({ ref }) => (ref.kind === "file" ? [{ path: ref.path }] : []));
  if (step.focus.kind === "all") {
    return cites;
  }

  const { nodes, edges, messages, tables } = step.focus;
  const steps = doc.flows.find((candidate) => candidate.id === flow)?.messages ?? [];
  return [
    ...filesOf(doc.nodes, nodes),
    ...filesOf(doc.edges, edges),
    ...filesOf(steps, messages),
    ...filesOf(doc.dataModel?.tables ?? [], tables),
    ...cites,
  ];
}

/** The files of a node or table. */
export function partRefs(doc: GraphDoc, id: string): FileRef[] {
  return filesOf([...doc.nodes, ...(doc.dataModel?.tables ?? [])], [id]);
}

function filesOf(parts: { id: string; files: FileRef[] }[], ids: string[]): FileRef[] {
  return parts.filter((part) => ids.includes(part.id)).flatMap((part) => part.files);
}

/** The hunks any ref touches. */
export function refsCode(pr: Pr, refs: FileRef[]): CodeFile[] {
  return pick(pr, (file, hunk) => refs.some((ref) => touches(ref, file, hunk)));
}

/** The given hunks, by file. */
export function hunksCode(pr: Pr, hunkIds: string[]): CodeFile[] {
  return pick(pr, (_file, hunk) => hunkIds.includes(hunk.id));
}

function pick(pr: Pr, keep: (file: PrFile, hunk: Hunk) => boolean): CodeFile[] {
  const hunks = new Map(pr.hunks.map((hunk) => [hunk.id, hunk]));
  return pr.files
    .map((file) => ({ file, hunks: file.hunkIds.flatMap((id) => hunks.get(id) ?? []).filter((hunk) => keep(file, hunk)) }))
    .filter((entry) => entry.hunks.length > 0);
}

/** Base-side refs name the old path and old line numbers. */
function touches(ref: FileRef, file: PrFile, hunk: Hunk): boolean {
  const isBase = ref.revision === "base";
  if (ref.path !== (isBase ? (file.previousPath ?? file.path) : file.path)) {
    return false;
  }

  if (ref.startLine === undefined) {
    return true;
  }

  const range = hunkRange(hunk);
  const [start, end] = isBase ? [range.oldStart, range.oldEnd] : [range.newStart, range.newEnd];
  return ref.startLine <= end && (ref.endLine ?? ref.startLine) >= start;
}
