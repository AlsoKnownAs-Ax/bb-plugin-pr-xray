import { describe, expect, it } from "vitest";
import { postmarkRefactorGraph } from "@coldtea/pr-lens-schema/examples";
import { renderDiagrams } from "./render";
import { parseAnalysisResult } from "./store";

describe("reading a stored analysis", () => {
  it("keeps the summary, groups and look-closely of an analysis from before PR Lens", () => {
    const legacy = {
      summary: "Caches user lookups.",
      groups: [{ id: "cache", title: "Cache", why: "The new cache.", kind: "core", hunkIds: ["h1"] }],
      lookClosely: [{ title: "Expiry", reason: "No TTL.", severity: "high", groupIds: ["cache"] }],
      diagrams: [{ id: "old", nodes: [] }],
    };

    const { result, legacy: isLegacy } = parseAnalysisResult(JSON.stringify(legacy));

    expect(isLegacy).toBe(true);
    expect(result?.summary).toBe("Caches user lookups.");
    expect(result?.groups.map((group) => group.id)).toEqual(["cache"]);
    expect(result?.lookClosely.map((item) => item.title)).toEqual(["Expiry"]);
    expect(result?.graph).toBeUndefined();
  });

  it("reads nothing, and asks for a re-run, from a result it cannot parse at all", () => {
    expect(parseAnalysisResult(JSON.stringify({ unrelated: true }))).toEqual({ result: null, legacy: true });
  });

  it("is not legacy when there is no result yet", () => {
    expect(parseAnalysisResult(null)).toEqual({ result: null, legacy: false });
  });

  it("reads a PR Lens result whole", () => {
    const graph = postmarkRefactorGraph;
    const current = { summary: "Batches sends.", groups: [{ id: "g", title: "Send", why: "Batches.", kind: "core", hunkIds: ["h1"] }], graph, renders: renderDiagrams(graph) };

    const { result, legacy } = parseAnalysisResult(JSON.stringify(current));

    expect(legacy).toBe(false);
    expect(result?.graph?.title).toBe(graph.title);
    expect(Object.keys(result?.renders ?? {})).toEqual(["overview", "send-pipeline"]);
  });
});
