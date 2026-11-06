// The PR Lens walkthrough's focus: which diagram tab a step or cite shows, and
// the box on that tab's render to zoom to.
import type { Box, RenderAtlas } from "@coldtea/pr-lens-renderer";
import type { CiteRef, GraphDoc, View, WalkthroughStep } from "@coldtea/pr-lens-schema";
import { commentTargets, type DiagramTab } from "../shared/diagram-tabs";

export type Focus = WalkthroughStep["focus"];
/** A tab to show (undefined = stay on the current one) and what to focus there. */
export interface Target {
  tab: string | undefined;
  focus: Focus;
}

const ALL: Focus = { kind: "all" };
const selection = (pick: Partial<Omit<Extract<Focus, { kind: "selection" }>, "kind">>): Focus => ({
  kind: "selection",
  lanes: [],
  nodes: [],
  edges: [],
  messages: [],
  tables: [],
  ...pick,
});

/** The submit check makes every stage name a tab, so a stage id is a tab id. */
export function stepTarget(step: WalkthroughStep): Target {
  return { tab: step.stage && (step.stage.kind === "view" ? step.stage.view : step.stage.flow), focus: step.focus };
}

/** Where a flow-step, view or flow cite leads; null for other cites, or ones with no diagram. */
export function citeTarget(doc: GraphDoc, tabs: DiagramTab[], ref: CiteRef): Target | null {
  const isTab = (id: string) => tabs.some((tab) => tab.id === id);
  if (ref.kind === "message") return isTab(ref.flow) ? { tab: ref.flow, focus: selection({ messages: [ref.message] }) } : null;
  if (ref.kind === "flow") return isTab(ref.flow) ? { tab: ref.flow, focus: ALL } : null;
  if (ref.kind !== "view") return null;
  if (isTab(ref.view)) return { tab: ref.view, focus: ALL };
  // A view with no tab: a flow view shows its flow, a drill-down shows its selection on its lens's tab.
  const view = findView(doc.views, ref.view);
  if (!view) return null;
  if (view.lens === "data-flow") {
    const flow = view.scope.kind === "selection" ? view.scope.flows[0] : doc.flows[0]?.id;
    return flow && isTab(flow) ? { tab: flow, focus: ALL } : null;
  }
  const tab = tabs.find((candidate) => candidate.lens === view.lens);
  if (!tab) return null;
  const { scope } = view;
  return {
    tab: tab.id,
    focus: scope.kind === "all" ? ALL : selection({ lanes: scope.lanes, nodes: scope.nodes, edges: scope.edges, tables: scope.tables }),
  };
}

/** The tab to select a cited node or table on: the current tab if it draws it, else the first that does; null if none. */
export function nodeTab(doc: GraphDoc, tabs: DiagramTab[], current: string, id: string): string | null {
  const draws = (tab: DiagramTab) => commentTargets(doc, tab).has(id);
  const here = tabs.find((tab) => tab.id === current);
  if (here && draws(here)) return here.id;
  return tabs.find(draws)?.id ?? null;
}

function findView(views: View[], id: string): View | undefined {
  for (const view of views) {
    const found = view.id === id ? view : findView(view.children, id);
    if (found) return found;
  }
  return undefined;
}

/** The bounding box of the focused elements on a render, or null for "all" or when none is drawn there. `flow` is the flow the render draws. */
export function focusBox(focus: Focus, atlas: RenderAtlas, flow?: string): Box | null {
  if (focus.kind === "all") return null;
  const boxes = [
    ...focus.lanes.map((id) => atlas.lanes[id]),
    ...focus.nodes.map((id) => atlas.nodes[id]),
    ...focus.edges.map((id) => atlas.edges[id]),
    ...focus.tables.map((id) => atlas.tables[id]),
    ...focus.messages.map((id) => (flow ? atlas.messages[flow]?.[id] : undefined)),
  ].filter((found) => found !== undefined);
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}
