// The Explain tab's diagrams, read from a PR Lens document: the architecture
// overview, each flow, and the data model if there is one. A tab id is what
// diagram comments store as their diagram id.
import type { GraphDoc } from "@coldtea/pr-lens-schema";

export const OVERVIEW_TAB = "overview";
export const DATA_MODEL_TAB = "data-model";

export type DiagramTab = {
  id: string;
  title: string;
  lens: "architecture" | "data-flow" | "data-model";
  /** The view to render, for the overview and data model when the document names one. */
  view?: string;
  /** The flow this tab draws, for data-flow tabs. */
  flow?: string;
};

export function diagramTabs(doc: GraphDoc): DiagramTab[] {
  const tabs = [
    viewTab(doc, "architecture"),
    ...doc.flows.map((flow): DiagramTab => ({ id: flow.id, title: flow.title, lens: "data-flow", flow: flow.id })),
  ];
  if (!doc.dataModel) {
    return tabs;
  }

  return [...tabs, viewTab(doc, "data-model")];
}

const DEFAULT_VIEW_TABS = {
  architecture: { id: OVERVIEW_TAB, title: "Architecture" },
  "data-model": { id: DATA_MODEL_TAB, title: "Data model" },
} satisfies Record<ViewTabLens, Pick<DiagramTab, "id" | "title">>;

type ViewTabLens = "architecture" | "data-model";

/** The overview or data-model tab: the document's first view of that lens, else a default tab. */
function viewTab(doc: GraphDoc, lens: ViewTabLens): DiagramTab {
  const view = doc.views.find((candidate) => candidate.lens === lens);
  if (!view) {
    return { ...DEFAULT_VIEW_TABS[lens], lens };
  }

  return { id: view.id, title: view.title, lens, view: view.id };
}

/** One diagram tab of a document, by id. */
export function diagramTab(doc: GraphDoc, id: string | null): DiagramTab | undefined {
  return diagramTabs(doc).find((tab) => tab.id === id);
}

/** Node and table ids a design comment can pin to on a tab, with their labels. */
export function commentTargets(doc: GraphDoc, tab: DiagramTab): Map<string, string> {
  return COMMENT_TARGETS[tab.lens](doc, tab);
}

function nodeLabels(doc: GraphDoc): Map<string, string> {
  return new Map(doc.nodes.map((node) => [node.id, node.label]));
}

const COMMENT_TARGETS = {
  architecture: nodeLabels,
  "data-model": (doc) => new Map(doc.dataModel?.tables.map((table) => [table.id, table.label])),
  "data-flow": (doc, tab) => {
    const nodes = nodeLabels(doc);
    const flow = doc.flows.find((candidate) => candidate.id === tab.flow);
    return new Map(flow?.participants.map((participant) => [participant.node, participant.label ?? nodes.get(participant.node) ?? participant.node]));
  },
} satisfies Record<DiagramTab["lens"], (doc: GraphDoc, tab: DiagramTab) => Map<string, string>>;
