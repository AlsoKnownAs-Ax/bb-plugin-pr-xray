import type { RenderAtlas } from "@coldtea/pr-lens-renderer";
import { describe, expect, it } from "vitest";
import { billingOrgGraph, postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";
import { diagramTabs } from "../shared/diagram-tabs";
import { citeTarget, focusBoxes, nodeTab, progressLabel, stepForKey, stepTarget, unionBox } from "./walkthrough";

const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

const atlas: RenderAtlas = {
  lanes: { api: box(0, 0, 500, 100) },
  nodes: { route: box(10, 10, 100, 40), cache: box(200, 60, 50, 50) },
  edges: { "route-cache": box(110, 30, 90, 40) },
  messages: { lookup: { get: box(20, 300, 80, 10), miss: box(20, 340, 80, 10) }, other: { get: box(900, 900, 10, 10) } },
  tables: { users: box(600, 0, 100, 200) },
  columns: {},
};

const selection = (pick: Partial<Record<"lanes" | "nodes" | "edges" | "messages" | "tables", string[]>>) => ({
  kind: "selection" as const,
  lanes: [],
  nodes: [],
  edges: [],
  messages: [],
  tables: [],
  ...pick,
});

const focusBox = (...args: Parameters<typeof focusBoxes>) => unionBox(focusBoxes(...args));

describe("walkthrough focus box", () => {
  it("is the union of the selected elements' boxes", () => {
    expect(focusBox(selection({ nodes: ["route", "cache"] }), atlas)).toEqual(box(10, 10, 240, 100));
    expect(focusBox(selection({ edges: ["route-cache"], tables: ["users"] }), atlas)).toEqual(box(110, 0, 590, 200));
  });

  it("is null for the 'all' focus, so the whole diagram shows", () => {
    expect(focusBox({ kind: "all" }, atlas)).toBeNull();
  });

  it("skips elements this render doesn't draw", () => {
    expect(focusBox(selection({ nodes: ["route", "elsewhere"] }), atlas)).toEqual(box(10, 10, 100, 40));
    expect(focusBox(selection({ nodes: ["elsewhere"] }), atlas)).toBeNull();
  });

  it("finds flow steps under the flow the tab draws", () => {
    expect(focusBox(selection({ messages: ["get", "miss"] }), atlas, "lookup")).toEqual(box(20, 300, 80, 50));
    expect(focusBox(selection({ messages: ["get"] }), atlas, "other")).toEqual(box(900, 900, 10, 10));
    expect(focusBox(selection({ messages: ["get"] }), atlas)).toBeNull();
  });
});

describe("walkthrough targets", () => {
  const doc = postmarkRefactorGraph;
  const tabs = diagramTabs(doc);
  const step = (id: string) => doc.walkthrough!.steps.find((candidate) => candidate.id === id)!;

  it("lists the overview and each flow as tabs", () => {
    expect(tabs.map((tab) => tab.id)).toEqual(["overview", "send-pipeline"]);
  });

  it("switches to the tab a step stages and keeps its focus", () => {
    expect(stepTarget(step("batches-of-500"))).toEqual({
      tab: "overview",
      focus: selection({ nodes: ["send-broadcast-bulk", "build-bulk-payload", "postmark"] }),
    });
    expect(stepTarget(step("four-batch-calls"))).toEqual({
      tab: "send-pipeline",
      focus: selection({ messages: ["batch-post", "batch-results"] }),
    });
  });

  it("stays on the current tab when a step has no stage", () => {
    expect(stepTarget({ ...step("blast-radius"), stage: undefined })).toEqual({ tab: undefined, focus: { kind: "all" } });
  });

  it("focuses a cited flow step on its flow's tab", () => {
    expect(citeTarget(doc, tabs, { kind: "message", flow: "send-pipeline", message: "batch-post" })).toEqual({
      tab: "send-pipeline",
      focus: selection({ messages: ["batch-post"] }),
    });
  });

  it("shows a cited flow or view whole", () => {
    expect(citeTarget(doc, tabs, { kind: "flow", flow: "send-pipeline" })).toEqual({ tab: "send-pipeline", focus: { kind: "all" } });
    expect(citeTarget(doc, tabs, { kind: "view", view: "overview" })).toEqual({ tab: "overview", focus: { kind: "all" } });
  });

  it("shows a cited drill-down view as its selection on the overview, and a flow view as its flow", () => {
    expect(citeTarget(doc, tabs, { kind: "view", view: "new-batch-path" })).toEqual({
      tab: "overview",
      focus: selection({
        nodes: ["send-broadcast-bulk", "build-bulk-payload", "get-suppressed-emails", "broadcast-lib", "postmark"],
        edges: ["bulk-to-payload", "bulk-to-suppressions", "bulk-to-lib", "suppressions-to-postmark", "bulk-to-postmark", "bulk-to-firestore"],
      }),
    });
    expect(citeTarget(doc, tabs, { kind: "view", view: "send-pipeline-view" })).toEqual({ tab: "send-pipeline", focus: { kind: "all" } });
  });

  it("shows a cited flow view as the flow it selects, or the first flow when it selects none", () => {
    const pipeline = doc.flows[0]!;
    const twoFlows = {
      ...doc,
      flows: [pipeline, { ...pipeline, id: "retry" }],
      views: [
        ...doc.views,
        { id: "retry-view", title: "Retry", lens: "data-flow" as const, scope: { ...doc.views[1]!.scope, flows: ["retry"] }, defaultOpen: false, children: [] },
        { id: "every-flow", title: "Every flow", lens: "data-flow" as const, scope: { kind: "all" as const }, defaultOpen: false, children: [] },
      ],
    };
    const twoFlowTabs = diagramTabs(twoFlows);
    expect(citeTarget(twoFlows, twoFlowTabs, { kind: "view", view: "retry-view" })).toEqual({ tab: "retry", focus: { kind: "all" } });
    expect(citeTarget(twoFlows, twoFlowTabs, { kind: "view", view: "every-flow" })).toEqual({ tab: "send-pipeline", focus: { kind: "all" } });

    const noFlows = { ...twoFlows, flows: [] };
    expect(citeTarget(noFlows, diagramTabs(noFlows), { kind: "view", view: "every-flow" })).toBeNull();
  });

  it("has no diagram target for file, node, unknown view or flow cites", () => {
    expect(citeTarget(doc, tabs, { kind: "file", path: "a.ts" })).toBeNull();
    expect(citeTarget(doc, tabs, { kind: "node", node: "postmark" })).toBeNull();
    expect(citeTarget(doc, tabs, { kind: "view", view: "nope" })).toBeNull();
    expect(citeTarget(doc, tabs, { kind: "flow", flow: "nope" })).toBeNull();
  });
});

describe("node cite tab", () => {
  const doc = postmarkRefactorGraph;
  const tabs = diagramTabs(doc);

  it("stays on the current tab when it draws the node", () => {
    expect(nodeTab(doc, tabs, "send-pipeline", "postmark")).toBe("send-pipeline");
    expect(nodeTab(doc, tabs, "overview", "postmark")).toBe("overview");
  });

  it("switches to the first tab that draws the node", () => {
    expect(nodeTab(doc, tabs, "send-pipeline", "build-bulk-payload")).toBe("overview");
  });

  it("finds a table on the data-model tab", () => {
    const billingTabs = diagramTabs(billingOrgGraph);
    const dataModel = billingTabs.find((tab) => tab.lens === "data-model")!.id;
    expect(nodeTab(billingOrgGraph, billingTabs, billingTabs[0]!.id, "invoice")).toBe(dataModel);
  });

  it("is undefined when no tab draws it", () => {
    expect(nodeTab(doc, tabs, "overview", "nope")).toBeUndefined();
  });
});

describe("walkthrough keys", () => {
  it("step forward from All to the first step, and stop at the last", () => {
    expect(stepForKey("ArrowRight", null, 3)).toBe(0);
    expect(stepForKey("ArrowRight", 0, 3)).toBe(1);
    expect(stepForKey("ArrowRight", 2, 3)).toBe(2);
  });

  it("step back, stopping at the first, and from All to the first", () => {
    expect(stepForKey("ArrowLeft", 2, 3)).toBe(1);
    expect(stepForKey("ArrowLeft", 0, 3)).toBe(0);
    expect(stepForKey("ArrowLeft", null, 3)).toBe(0);
  });

  it("Escape goes back to All, and does nothing from All", () => {
    expect(stepForKey("Escape", 1, 3)).toBeNull();
    expect(stepForKey("Escape", null, 3)).toBeUndefined();
  });

  it("ignore other keys", () => {
    expect(stepForKey("Enter", 1, 3)).toBeUndefined();
  });
});

describe("walkthrough progress", () => {
  it("counts the steps on All, and says which step is shown otherwise", () => {
    expect(progressLabel(null, 4)).toBe("4 steps");
    expect(progressLabel(0, 4)).toBe("1 of 4");
  });
});
