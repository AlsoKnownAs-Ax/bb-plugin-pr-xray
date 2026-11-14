import { billingOrgGraph, postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";
import { describe, expect, it } from "vitest";
import { renderDiagrams } from "../server/render";
import { diagramTabs } from "../shared/diagram-tabs";
import { overlayTargets } from "./diagram-overlay";

const billingRenders = renderDiagrams(billingOrgGraph);
const [overview, dataModel] = diagramTabs(billingOrgGraph);

describe("diagram overlay", () => {
  it("puts a click target on each node of the overview, at its card in the render", () => {
    const atlas = billingRenders[overview!.id]!.light.atlas;
    const targets = overlayTargets(billingOrgGraph, overview!, atlas);
    expect(targets.map((target) => target.id)).toEqual(["billing-service", "org-service"]);
    expect(targets[0]!.box).toEqual(atlas.nodes["billing-service"]);
  });

  it("tells the panel a node's label, kind and delta", () => {
    const [billing] = overlayTargets(billingOrgGraph, overview!, billingRenders[overview!.id]!.light.atlas);
    expect(billing).toMatchObject({ label: "Billing service", kind: "service", delta: "modified" });
  });

  it("puts targets on tables in the data model", () => {
    const targets = overlayTargets(billingOrgGraph, dataModel!, billingRenders[dataModel!.id]!.light.atlas);
    expect(targets.map((target) => target.id)).toEqual(["user", "session", "organization", "membership", "subscription", "invoice"]);
    expect(targets[4]).toMatchObject({ label: "Subscription", kind: "table", delta: "modified" });
  });

  it("targets the participants of a flow", () => {
    const tabs = diagramTabs(postmarkRefactorGraph);
    const flow = tabs.find((tab) => tab.lens === "data-flow")!;
    const atlas = renderDiagrams(postmarkRefactorGraph)[flow.id]!.light.atlas;
    const participants = postmarkRefactorGraph.flows[0]!.participants.map((participant) => participant.node);
    expect(overlayTargets(postmarkRefactorGraph, flow, atlas).map((target) => target.id)).toEqual(participants);
  });
});
