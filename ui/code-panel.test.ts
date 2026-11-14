import type { GraphDoc, WalkthroughStep } from "@coldtea/pr-lens-schema";
import { describe, expect, it } from "vitest";
import type { Hunk, PrDetails, PrFile } from "../shared/schema";
import { hunksCode, partRefs, refsCode, stepRefs } from "./code-panel";

const hunk = (id: string, fileIndex: number, header: string) => ({ id, fileIndex, header }) as Hunk;
const file = (index: number, path: string, hunkIds: string[], previousPath: string | null = null) =>
  ({ index, path, previousPath, hunkIds }) as PrFile;

// api.ts: new lines 10-13 and 40-41; db.ts (renamed from old-db.ts): old lines 5-7.
const pr = {
  files: [file(0, "api.ts", ["a1", "a2"]), file(1, "db.ts", ["d1"], "old-db.ts")],
  hunks: [hunk("a1", 0, "@@ -10,3 +10,4 @@"), hunk("a2", 0, "@@ -38,1 +40,2 @@"), hunk("d1", 1, "@@ -5,3 +5,1 @@")],
} as Pick<PrDetails, "files" | "hunks">;

const ids = (code: ReturnType<typeof refsCode>) => code.map((entry) => [entry.file.path, entry.hunks.map((h) => h.id)]);

const doc = {
  nodes: [
    { id: "route", files: [{ path: "api.ts", startLine: 12, endLine: 12 }] },
    { id: "store", files: [{ path: "db.ts" }] },
  ],
  edges: [{ id: "route-store", files: [{ path: "api.ts", startLine: 41 }] }],
  flows: [
    { id: "lookup", messages: [{ id: "get", files: [{ path: "old-db.ts", startLine: 6, revision: "base" }] }] },
    { id: "other", messages: [{ id: "get", files: [{ path: "api.ts" }] }] },
  ],
  dataModel: { tables: [{ id: "users", files: [{ path: "db.ts", startLine: 1, endLine: 2 }] }] },
} as unknown as GraphDoc;

const step = (focus: Partial<Record<"nodes" | "edges" | "messages" | "tables", string[]>>, cites: string[] = []): WalkthroughStep =>
  ({
    focus: { kind: "selection", lanes: [], nodes: [], edges: [], messages: [], tables: [], ...focus },
    detail: cites.length > 0 ? { cites: cites.map((path) => ({ ref: { kind: "file", path } })) } : undefined,
  }) as unknown as WalkthroughStep;

describe("the code behind a walkthrough step", () => {
  it("is the hunks overlapping its focused parts' line ranges", () => {
    expect(ids(refsCode(pr, stepRefs(doc, step({ nodes: ["route"] }))))).toEqual([["api.ts", ["a1"]]]);
    expect(ids(refsCode(pr, stepRefs(doc, step({ edges: ["route-store"] }))))).toEqual([["api.ts", ["a2"]]]);
  });

  it("is every hunk of a file named without lines, or cited", () => {
    expect(ids(refsCode(pr, stepRefs(doc, step({ nodes: ["store"] }))))).toEqual([["db.ts", ["d1"]]]);
    expect(ids(refsCode(pr, stepRefs(doc, step({}, ["api.ts"])))))
      .toEqual([["api.ts", ["a1", "a2"]]]);
  });

  it("matches a base-side range against old lines and the file's old path", () => {
    expect(ids(refsCode(pr, stepRefs(doc, step({ messages: ["get"] }), "lookup")))).toEqual([["db.ts", ["d1"]]]);
  });

  it("finds flow steps only in the flow the step shows", () => {
    expect(ids(refsCode(pr, stepRefs(doc, step({ messages: ["get"] }), "other")))).toEqual([["api.ts", ["a1", "a2"]]]);
    expect(refsCode(pr, stepRefs(doc, step({ messages: ["get"] })))).toEqual([]);
  });

  it("keeps PR order and lists each hunk once", () => {
    const refs = stepRefs(doc, step({ nodes: ["store", "route"], edges: ["route-store"] }, ["api.ts"]));
    expect(ids(refsCode(pr, refs))).toEqual([
      ["api.ts", ["a1", "a2"]],
      ["db.ts", ["d1"]],
    ]);
  });

  it("is nothing for a range no hunk touches, or the 'all' focus", () => {
    expect(refsCode(pr, stepRefs(doc, step({ tables: ["users"] })))).toEqual([]);
    expect(stepRefs(doc, { focus: { kind: "all" } } as WalkthroughStep)).toEqual([]);
  });
});

describe("the code behind a diagram part", () => {
  it("is a node's or a table's files", () => {
    expect(ids(refsCode(pr, partRefs(doc, "route")))).toEqual([["api.ts", ["a1"]]]);
    expect(partRefs(doc, "users")).toEqual([{ path: "db.ts", startLine: 1, endLine: 2 }]);
    expect(partRefs(doc, "missing")).toEqual([]);
  });
});

describe("the code of a group", () => {
  it("is its hunks, by file in PR order", () => {
    expect(ids(hunksCode(pr, ["d1", "a2", "gone"]))).toEqual([
      ["api.ts", ["a2"]],
      ["db.ts", ["d1"]],
    ]);
  });
});
