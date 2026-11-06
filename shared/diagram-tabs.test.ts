import { billingOrgGraph, minimalGraph, postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";
import { describe, expect, it } from "vitest";
import { commentTargets, diagramTab, diagramTabs } from "./diagram-tabs";

describe("diagram tabs", () => {
  it("names the overview and data-model tabs after their views", () => {
    expect(diagramTabs(billingOrgGraph)).toEqual([
      { id: "architecture-overview", title: billingOrgGraph.views[0]!.title, lens: "architecture", view: "architecture-overview" },
      { id: "data-model", title: billingOrgGraph.views[1]!.title, lens: "data-model", view: "data-model" },
    ]);
  });

  it("gives the overview and data model default tabs when no view names them", () => {
    const noViews = { ...billingOrgGraph, views: [] };
    expect(diagramTabs(noViews)).toEqual([
      { id: "overview", title: "Architecture", lens: "architecture", view: undefined },
      { id: "data-model", title: "Data model", lens: "data-model", view: undefined },
    ]);
  });

  it("has only the overview for a document with no flows or data model", () => {
    expect(diagramTabs(minimalGraph).map((tab) => tab.id)).toEqual(["overview"]);
  });

  it("finds one tab by id, and none for an unknown or missing id", () => {
    expect(diagramTab(postmarkRefactorGraph, "send-pipeline")?.flow).toBe("send-pipeline");
    expect(diagramTab(postmarkRefactorGraph, "nope")).toBeUndefined();
    expect(diagramTab(postmarkRefactorGraph, null)).toBeUndefined();
  });
});

describe("comment targets", () => {
  it("are the nodes on the overview, the tables on the data model and the participants on a flow", () => {
    const [overview, dataModel] = diagramTabs(billingOrgGraph);
    expect([...commentTargets(billingOrgGraph, overview!).keys()]).toEqual(billingOrgGraph.nodes.map((node) => node.id));
    expect(commentTargets(billingOrgGraph, dataModel!).get("invoice")).toBe("Invoice");
    const flow = diagramTab(postmarkRefactorGraph, "send-pipeline")!;
    expect([...commentTargets(postmarkRefactorGraph, flow).keys()]).toEqual(["queue-route", "broadcast-queue", "send-broadcast-bulk", "postmark"]);
  });

  it("label an unlabelled flow participant with its node's label, or its id when the node is missing", () => {
    const flow = diagramTab(postmarkRefactorGraph, "send-pipeline")!;
    const unlabelled = {
      ...postmarkRefactorGraph,
      flows: postmarkRefactorGraph.flows.map((candidate) => ({ ...candidate, participants: candidate.participants.map(({ label: _label, ...participant }) => participant) })),
    };
    const postmark = postmarkRefactorGraph.nodes.find((node) => node.id === "postmark")!;
    expect(commentTargets(unlabelled, flow).get("postmark")).toBe(postmark.label);
    const withoutPostmark = { ...unlabelled, nodes: postmarkRefactorGraph.nodes.filter((node) => node !== postmark) };
    expect(commentTargets(withoutPostmark, flow).get("postmark")).toBe("postmark");
  });

  it("label a flow participant with its own label when it has one, as the card shows", () => {
    const flow = diagramTab(postmarkRefactorGraph, "send-pipeline")!;
    const flows = postmarkRefactorGraph.flows.map((candidate) =>
      candidate.id === "send-pipeline"
        ? { ...candidate, participants: candidate.participants.map((participant) => (participant.node === "postmark" ? { ...participant, label: "Mail API" } : participant)) }
        : candidate,
    );
    expect(commentTargets({ ...postmarkRefactorGraph, flows }, flow).get("postmark")).toBe("Mail API");
  });

  it("are empty on a tab whose flow or data model the document no longer has", () => {
    const flow = diagramTab(postmarkRefactorGraph, "send-pipeline")!;
    expect(commentTargets({ ...postmarkRefactorGraph, flows: [] }, flow).size).toBe(0);
    const dataModel = diagramTab(billingOrgGraph, "data-model")!;
    expect(commentTargets({ ...billingOrgGraph, dataModel: undefined }, dataModel).size).toBe(0);
  });
});
