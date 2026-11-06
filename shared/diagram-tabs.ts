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
  const overview = doc.views.find((view) => view.lens === "architecture");
  const dataModel = doc.views.find((view) => view.lens === "data-model");
  const tabs: DiagramTab[] = [
    { id: overview?.id ?? OVERVIEW_TAB, title: overview?.title ?? "Architecture", lens: "architecture", view: overview?.id },
    ...doc.flows.map((flow): DiagramTab => ({ id: flow.id, title: flow.title, lens: "data-flow", flow: flow.id })),
  ];
  if (!doc.dataModel) {
    return tabs;
  }

  return [...tabs, { id: dataModel?.id ?? DATA_MODEL_TAB, title: dataModel?.title ?? "Data model", lens: "data-model", view: dataModel?.id }];
}

/** One diagram tab of a document, by id. */
export function diagramTab(doc: GraphDoc, id: string | null): DiagramTab | undefined {
  return diagramTabs(doc).find((tab) => tab.id === id);
}

/** Node and table ids a design comment can pin to on a tab, with their labels. */
export function commentTargets(doc: GraphDoc, tab: DiagramTab): Map<string, string> {
  const nodes = new Map(doc.nodes.map((node) => [node.id, node.label]));
  if (tab.lens === "data-model") {
    return new Map((doc.dataModel?.tables ?? []).map((table) => [table.id, table.label]));
  }

  if (tab.lens === "data-flow") {
    const flow = doc.flows.find((candidate) => candidate.id === tab.flow);
    return new Map((flow?.participants ?? []).map((participant) => [participant.node, nodes.get(participant.node) ?? participant.node]));
  }

  return nodes;
}
