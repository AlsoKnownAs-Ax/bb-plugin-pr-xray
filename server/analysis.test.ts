import { describe, expect, it } from "vitest";
import type { PrDetails } from "../shared/schema";
import { annotatedDiff, checkAnalysis, findTicketUrl } from "./analysis";

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

  it("accepts exactly 4 diagrams", () => {
    const doc = graph();
    doc.flows.push(...["a", "b"].map((id) => ({ ...(doc.flows[0] as object), id })));
    expect(checkAnalysis(submission({ graph: doc }), pr).ok).toBe(true);
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

  it("draws every tab in light and dark", () => {
    const checked = checkAnalysis(submission(), pr);
    if (!checked.ok) throw new Error(checked.problems.join("\n"));
    const renders = checked.value.renders;
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

  it("returns a graph the renderer cannot draw as a problem", () => {
    const doc = graph();
    doc.lanes.push({ id: "empty", label: "Empty" });
    doc.views[0] = { id: "overview", title: "Architecture", lens: "architecture", scope: { kind: "selection", lanes: ["empty"] } };
    expect(problemsOf(submission({ graph: doc }))).toMatch(/^graph: cannot be drawn: /);
  });

  it("names the root when the submission is not an object", () => {
    expect(problemsOf("not json")).toMatch(/^\(root\): /m);
    expect(problemsOf(null)).toContain("graph: missing");
    expect(problemsOf({ ...submission(), graph: 42 })).toMatch(/^graph: /m);
  });

  it("reports a bad base field alongside the walkthrough problems of a good graph", () => {
    const { walkthrough: _walkthrough, ...doc } = graph();
    const problems = problemsOf(submission({ summary: undefined, graph: doc }));
    expect(problems).toMatch(/^summary: /m);
    expect(problems).toContain("graph.walkthrough: missing");
  });

  it("accepts a step with no stage", () => {
    const doc = graph();
    delete (doc.walkthrough.steps[1] as { stage?: unknown }).stage;
    expect(checkAnalysis(submission({ graph: doc }), pr).ok).toBe(true);
  });

  it("names a single hunk that is in no group", () => {
    const twoHunks = { hunks: [{ id: "h1" }, { id: "h2" }] } as unknown as PrDetails;
    const checked = checkAnalysis(submission(), twoHunks);
    expect(checked.ok ? [] : checked.problems).toContain("These hunks are in no group: h2.");
  });

  it("skips the hunk checks when there is no PR snapshot", () => {
    expect(checkAnalysis(submission({ groups: [{ id: "g1", title: "Cache", why: "Faster.", kind: "core", hunkIds: ["h9"] }] }), null).ok).toBe(true);
  });
});

describe("the ticket link", () => {
  it("is the first match of the pattern, without trailing punctuation", () => {
    const pattern = String.raw`https://www\.notion\.so/\S+`;
    expect(findTicketUrl("See https://www.notion.so/acme/Cache-123). Thanks", pattern)).toBe("https://www.notion.so/acme/Cache-123");
    expect(findTicketUrl("No link here.", pattern)).toBeNull();
  });

  it("falls back to any Notion link when the pattern is not a valid regex", () => {
    expect(findTicketUrl("Ticket: https://app.notion.com/p/abc]", "(")).toBe("https://app.notion.com/p/abc");
  });
});

describe("the annotated diff", () => {
  it("lists each file with its hunks, and says when a file has no patch", () => {
    const withFiles = {
      files: [
        { path: "a.ts", previousPath: "old.ts", status: "renamed", additions: 1, deletions: 0, hasPatch: true, hunkIds: ["h1"] },
        { path: "logo.png", status: "added", additions: 0, deletions: 0, hasPatch: false, hunkIds: [] },
      ],
      hunks: [{ id: "h1", patch: "+x" }],
    } as unknown as PrDetails;
    expect(annotatedDiff(withFiles).split("\n")).toEqual([
      "",
      "=== FILE a.ts (renamed from old.ts) [renamed, +1/-0]",
      "--- HUNK h1",
      "+x",
      "",
      "=== FILE logo.png [added, +0/-0]",
      "(no textual patch: binary or too large)",
    ]);
  });
});
