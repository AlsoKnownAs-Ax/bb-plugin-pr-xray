import { billingOrgGraph, postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";
import { describe, expect, it } from "vitest";
import { renderDiagrams } from "../server/render";
import { diagramTabs } from "../shared/diagram-tabs";
import type { StoredComment } from "../shared/schema";
import { overlayTargets } from "./diagram-overlay";

const billingRenders = renderDiagrams(billingOrgGraph);
const [overview, dataModel] = diagramTabs(billingOrgGraph);

const pin = (diagramId: string, nodeId: string, status: StoredComment["status"] = "open") =>
  ({ source: "diagram", diagramId, nodeId, status }) as StoredComment;

describe("diagram overlay", () => {
  it("puts a click target on each node of the overview, at its card in the render", () => {
    const atlas = billingRenders[overview!.id]!.light.atlas;
    const targets = overlayTargets(billingOrgGraph, overview!, atlas, []);
    expect(targets.map((target) => target.id)).toEqual(["billing-service", "org-service"]);
    expect(targets[0]!.box).toEqual(atlas.nodes["billing-service"]);
  });

  it("tells the panel a node's label, kind, delta and files", () => {
    const [billing] = overlayTargets(billingOrgGraph, overview!, billingRenders[overview!.id]!.light.atlas, []);
    expect(billing).toMatchObject({ label: "Billing service", kind: "service", delta: "modified", files: ["src/billing/subscription.ts"] });
  });

  it("puts targets on tables in the data model, with their files", () => {
    const targets = overlayTargets(billingOrgGraph, dataModel!, billingRenders[dataModel!.id]!.light.atlas, []);
    expect(targets.map((target) => target.id)).toEqual(["user", "session", "organization", "membership", "subscription", "invoice"]);
    expect(targets[4]).toMatchObject({ label: "Subscription", kind: "table", delta: "modified", files: ["migrations/0042_billing_by_org.sql", "prisma/schema.prisma"] });
  });

  it("targets the participants of a flow", () => {
    const tabs = diagramTabs(postmarkRefactorGraph);
    const flow = tabs.find((tab) => tab.lens === "data-flow")!;
    const atlas = renderDiagrams(postmarkRefactorGraph)[flow.id]!.light.atlas;
    const participants = postmarkRefactorGraph.flows[0]!.participants.map((participant) => participant.node);
    expect(overlayTargets(postmarkRefactorGraph, flow, atlas, []).map((target) => target.id)).toEqual(participants);
  });

  it("counts pins on their own tab and target, leaving out outdated ones", () => {
    const targets = overlayTargets(billingOrgGraph, dataModel!, billingRenders[dataModel!.id]!.light.atlas, [
      pin("data-model", "subscription"),
      pin("data-model", "subscription", "resolved"),
      pin("data-model", "subscription", "outdated"),
      pin("data-model", "invoice", "resolved"),
      pin(overview!.id, "subscription"),
    ]);
    const pins = Object.fromEntries(targets.filter((target) => target.pins > 0).map((target) => [target.id, [target.pins, target.openPins]]));
    expect(pins).toEqual({ subscription: [2, 1], invoice: [1, 0] });
  });
});
