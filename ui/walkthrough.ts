// The PR Lens walkthrough's focus: which diagram tab a step or cite shows, and
// the box on that tab's render to zoom to.
import type { Box, RenderAtlas } from "@coldtea/pr-lens-renderer";
import type { CiteRef, GraphDoc, View, WalkthroughStep } from "@coldtea/pr-lens-schema";
import { commentTargets, type DiagramTab } from "../shared/diagram-tabs";

export type Focus = WalkthroughStep["focus"];
/** A tab to show (undefined = stay on the current one) and what to focus there. */
export type Target = {
  tab: string | undefined;
  focus: Focus;
};

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
  return { tab: stageTab(step.stage), focus: step.focus };
}

function stageTab(stage: WalkthroughStep["stage"]): string | undefined {
  if (stage?.kind === "view") {
    return stage.view;
  }

  return stage?.flow;
}

/** Where a flow-step, view or flow cite leads; null for other cites, or ones with no diagram. */
export function citeTarget(doc: GraphDoc, tabs: DiagramTab[], ref: CiteRef): Target | null {
  const isTab = (id: string | undefined) => tabs.some((tab) => tab.id === id);
  if (ref.kind === "message" || ref.kind === "flow") {
    if (!isTab(ref.flow)) {
      return null;
    }

    return { tab: ref.flow, focus: citedStep(ref) };
  }

  if (ref.kind !== "view") {
    return null;
  }

  if (isTab(ref.view)) {
    return { tab: ref.view, focus: ALL };
  }

  // A view with no tab: a flow view shows its flow, a drill-down shows its selection on its lens's tab.
  const view = findView(doc.views, ref.view);
  if (!view) {
    return null;
  }

  if (view.lens === "data-flow") {
    const flow = viewFlow(doc, view);
    if (!isTab(flow)) {
      return null;
    }

    return { tab: flow, focus: ALL };
  }

  const tab = tabs.find((candidate) => candidate.lens === view.lens);
  if (!tab) {
    return null;
  }

  return { tab: tab.id, focus: scopeFocus(view.scope) };
}

/** A flow-step cite focuses its step; a flow cite shows the whole flow. */
function citedStep(ref: Extract<CiteRef, { kind: "message" | "flow" }>): Focus {
  if (ref.kind === "message") {
    return selection({ messages: [ref.message] });
  }

  return ALL;
}

/** The flow a data-flow view draws: its selected flow, else the document's first. */
function viewFlow(doc: GraphDoc, view: View): string | undefined {
  if (view.scope.kind === "selection") {
    return view.scope.flows[0];
  }

  return doc.flows[0]?.id;
}

function scopeFocus(scope: View["scope"]): Focus {
  if (scope.kind === "all") {
    return ALL;
  }

  return selection({ lanes: scope.lanes, nodes: scope.nodes, edges: scope.edges, tables: scope.tables });
}

/** The tab to select a cited node or table on: the current tab if it draws it, else the first that does; undefined if none. */
export function nodeTab(doc: GraphDoc, tabs: DiagramTab[], current: string, id: string): string | undefined {
  const draws = (tab: DiagramTab) => commentTargets(doc, tab).has(id);
  const here = tabs.find((tab) => tab.id === current);
  if (here && draws(here)) {
    return here.id;
  }

  return tabs.find(draws)?.id;
}

function findView(views: View[], id: string): View | undefined {
  for (const view of views) {
    if (view.id === id) {
      return view;
    }

    const found = findView(view.children, id);
    if (found) {
      return found;
    }
  }

  return undefined;
}

/** The boxes of the focused elements on a render; none for "all" or when none is drawn there. `flow` is the flow the render draws. */
export function focusBoxes(focus: Focus, atlas: RenderAtlas, flow = ""): Box[] {
  if (focus.kind === "all") {
    return [];
  }

  return [
    ...focus.lanes.map((id) => atlas.lanes[id]),
    ...focus.nodes.map((id) => atlas.nodes[id]),
    ...focus.edges.map((id) => atlas.edges[id]),
    ...focus.tables.map((id) => atlas.tables[id]),
    // No flow, no flow steps: no messages are keyed under "" (not a valid id).
    ...focus.messages.map((id) => atlas.messages[flow]?.[id]),
  ].filter((found) => found !== undefined);
}

/** The box round all of `boxes`, to zoom to; null when there are none. */
export function unionBox(boxes: Box[]): Box | null {
  if (boxes.length === 0) {
    return null;
  }

  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
}

const VEIL_PAD = 6;

/** The holes the dimming veil leaves: each focused box with room round it. */
export function veilHoles(boxes: Box[]): Box[] {
  return boxes.map((b) => ({ x: b.x - VEIL_PAD, y: b.y - VEIL_PAD, width: b.width + VEIL_PAD * 2, height: b.height + VEIL_PAD * 2 }));
}
