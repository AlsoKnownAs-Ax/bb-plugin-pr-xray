import { describe, expect, it } from "vitest";
import type { PrDetails } from "../shared/schema";
import { checkAnalysis } from "./analysis";
import { renderDiagrams } from "./render";

const pr = { hunks: [{ id: "h1" }] } as unknown as PrDetails;

/** A small valid PR Lens document: an overview and one flow, with a two-step walkthrough. */
function graph() {
  return {
    schemaVersion: "0.3.0",
    kind: "graph",
    title: "Cache user lookups",
    lenses: ["architecture", "data-flow"],
    provenance: { repo: { owner: "acme", name: "web" }, base: { sha: "1111111" }, head: { sha: "2222222" } },
    lanes: [{ id: "api", label: "API" }, { id: "data", label: "Data" }],
    nodes: [
      { id: "user-route", label: "GET /users/:id", kind: "route", delta: "modified", lane: "api", files: [{ path: "src/routes/users.ts" }] },
      { id: "user-cache", label: "User cache", kind: "cache", delta: "added", lane: "data" },
    ],
    edges: [{ id: "route-cache", from: "user-route", to: "user-cache", kind: "call", delta: "added" }],
    flows: [
      {
        id: "lookup",
        title: "Look up a user",
        participants: [{ node: "user-route" }, { node: "user-cache" }],
        messages: [{ id: "get", from: "user-route", to: "user-cache", label: "get(id)", delta: "added" }],
      },
    ] as unknown[],
    views: [{ id: "overview", title: "Architecture", lens: "architecture" }] as unknown[],
    walkthrough: {
      steps: [
        { id: "one", heading: "A cache arrives", body: "The route asks the cache first.", stage: { kind: "view", view: "overview" } },
        { id: "two", heading: "The lookup", body: "One call to the cache.", stage: { kind: "flow", flow: "lookup" } },
      ] as unknown[],
    },
  };
}

function submission(overrides: Record<string, unknown> = {}) {
  return {
    summary: "Caches user lookups.",
    groups: [{ id: "g1", title: "Cache", why: "Faster reads.", kind: "core", hunkIds: ["h1"] }],
    graph: graph(),
    ...overrides,
  };
}

function problemsOf(candidate: unknown): string {
  const checked = checkAnalysis(candidate, pr);
  if (checked.ok) throw new Error("expected problems");
  return checked.problems.join("\n");
}

describe("the analysis submit check", () => {
  it("accepts a valid PR Lens document", () => {
    const checked = checkAnalysis(submission(), pr);
    expect(checked.ok).toBe(true);
  });

  it("returns the PR Lens parser's errors as problems", () => {
    const doc = graph();
    doc.edges[0]!.to = "ghost";
    expect(problemsOf(submission({ graph: doc }))).toMatch(/graph\.edges\[0\]\.to: .*ghost/);
  });

  it("requires a walkthrough", () => {
    const { walkthrough: _walkthrough, ...doc } = graph();
    expect(problemsOf(submission({ graph: doc }))).toContain("graph.walkthrough: missing; write a walkthrough of 2-12 steps.");
  });

  it("rejects a one-step walkthrough", () => {
    const doc = graph();
    doc.walkthrough.steps = doc.walkthrough.steps.slice(0, 1);
    expect(problemsOf(submission({ graph: doc }))).toMatch(/graph\.walkthrough\.steps: .*>=2/);
  });

  it("rejects more than 4 diagrams", () => {
    const doc = graph();
    doc.flows.push(...["a", "b", "c"].map((id) => ({ ...(doc.flows[0] as object), id })));
    expect(problemsOf(submission({ graph: doc }))).toContain("draws 5 diagrams");
  });

  it("rejects a step staged on a view that has no tab", () => {
    const doc = graph();
    doc.views.push({ id: "drill", title: "Drill-down", lens: "architecture" });
    (doc.walkthrough.steps[0] as { stage: unknown }).stage = { kind: "view", view: "drill" };
    expect(problemsOf(submission({ graph: doc }))).toContain("step 'one' stages view 'drill', which is not a diagram tab");
  });

  it("rejects a flow that shares an id with the overview", () => {
    const doc = graph();
    (doc.flows[0] as { id: string }).id = "overview";
    (doc.walkthrough.steps[1] as { stage: unknown }).stage = { kind: "flow", flow: "overview" };
    expect(problemsOf(submission({ graph: doc }))).toContain("two diagrams share the id 'overview'");
  });

  it("rejects the old diagram and narrative format", () => {
    const { graph: _graph, ...rest } = submission();
    const old = {
      ...rest,
      narrative: [{ title: "Step", body: "Body", groupIds: [] }],
      diagrams: [{ id: "d", title: "Flow", kind: "flow", nodes: [{ id: "a", label: "A" }] }],
    };
    expect(problemsOf(old)).toContain("graph: missing; submit a PR Lens graph document.");
  });

  it("lets the server draw every tab in light and dark", () => {
    const checked = checkAnalysis(submission(), pr);
    if (!checked.ok) throw new Error(checked.problems.join("\n"));
    const renders = renderDiagrams(checked.value.graph);
    expect(Object.keys(renders)).toEqual(["overview", "lookup"]);
    expect(renders.overview!.light.svg).toMatch(/^<svg/);
    expect(renders.overview!.dark.background).not.toBe(renders.overview!.light.background);
    expect(Object.keys(renders.lookup!.dark.atlas.messages)).toEqual(["lookup"]);
  });

  it("still checks every hunk is in a group", () => {
    expect(problemsOf(submission({ groups: [{ id: "g1", title: "Cache", why: "Faster.", kind: "core", hunkIds: ["h9"] }]}))).toContain(
      "Group g1 references unknown hunk h9.",
    );
  });
});
