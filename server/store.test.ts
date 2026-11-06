import { describe, expect, it } from "vitest";
import { parseAnalysisResult } from "./store";

describe("reading a stored analysis", () => {
  it("keeps the summary, groups and look-closely of an analysis from before PR Lens", () => {
    const legacy = {
      summary: "Caches user lookups.",
      groups: [{ id: "cache", title: "Cache", why: "The new cache.", kind: "core", hunkIds: ["h1"] }],
      lookClosely: [{ title: "Expiry", reason: "No TTL.", severity: "high", groupIds: ["cache"] }],
      diagrams: [{ id: "old", nodes: [] }],
    };

    const result = parseAnalysisResult(JSON.stringify(legacy));

    expect(result?.summary).toBe("Caches user lookups.");
    expect(result?.groups.map((group) => group.id)).toEqual(["cache"]);
    expect(result?.lookClosely.map((item) => item.title)).toEqual(["Expiry"]);
    expect(result?.graph).toBeUndefined();
  });

  it("reads nothing from a result it cannot parse at all", () => {
    expect(parseAnalysisResult(JSON.stringify({ unrelated: true }))).toBeNull();
    expect(parseAnalysisResult(null)).toBeNull();
  });
});
