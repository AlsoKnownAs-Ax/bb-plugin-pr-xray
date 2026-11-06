import { describe, expect, it } from "vitest";
import type { Hunk, PrFile } from "../shared/schema";
import { buildFileTree, fileStatus, fileTooltip, groupsOfPath, notListedLabel, topmostPath, viewedPaths, type FileTreeNode } from "./file-tree";

const file = (path: string, extra: Partial<PrFile> = {}): PrFile => ({
  index: 0,
  path,
  previousPath: null,
  status: "modified",
  additions: 1,
  deletions: 1,
  hasPatch: true,
  hunkIds: ["h"],
  ...extra,
});

/** The tree as indented row names, which is what the reviewer sees. */
const rows = (nodes: FileTreeNode[], depth = 0): string[] =>
  nodes.flatMap((node) => [`${"  ".repeat(depth)}${node.name}`, ...(node.kind === "dir" ? rows(node.children, depth + 1) : [])]);

describe("file tree", () => {
  it("puts folders before files, each alphabetical", () => {
    const tree = buildFileTree([file("b.ts"), file("z/x.ts"), file("a.ts"), file("m/y.ts")]);
    expect(rows(tree)).toEqual(["m", "  y.ts", "z", "  x.ts", "a.ts", "b.ts"]);
  });

  it("compacts a chain of single-folder folders into one row", () => {
    const tree = buildFileTree([file("src/server/utils/a.ts"), file("src/server/utils/b.ts"), file("src/ui/c.ts")]);
    expect(rows(tree)).toEqual(["src", "  server/utils", "    a.ts", "    b.ts", "  ui", "    c.ts"]);
    expect(rows(buildFileTree([file("a/b/c.ts")]))).toEqual(["a/b", "  c.ts"]);
  });

  it("does not compact a folder that also holds a file", () => {
    expect(rows(buildFileTree([file("a/b/c.ts"), file("a/d.ts")]))).toEqual(["a", "  b", "    c.ts", "  d.ts"]);
  });

  it("sums the additions and deletions of everything under a folder", () => {
    const [src] = buildFileTree([
      file("src/a.ts", { additions: 3, deletions: 1 }),
      file("src/deep/er/b.ts", { additions: 10, deletions: 0 }),
      file("src/deep/er/c.ts", { additions: 0, deletions: 5 }),
    ]);
    expect(src).toMatchObject({ kind: "dir", additions: 13, deletions: 6 });
    expect(src?.kind === "dir" && src.children[0]).toMatchObject({ name: "deep/er", path: "src/deep/er", additions: 10, deletions: 5 });
  });

  it("places a renamed file under its new path, with the old path in its tooltip", () => {
    const moved = file("new/name.ts", { status: "renamed", previousPath: "old/name.ts" });
    expect(rows(buildFileTree([moved]))).toEqual(["new", "  name.ts"]);
    expect(fileStatus(moved).letter).toBe("R");
    expect(fileTooltip(moved)).toBe("old/name.ts → new/name.ts");
    expect(fileTooltip(file("a.ts"))).toBe("a.ts");
  });

  it("shows a change status letter", () => {
    const letter = (status: string) => fileStatus(file("a.ts", { status })).letter;
    expect(["added", "modified", "removed", "renamed", "changed"].map(letter)).toEqual(["A", "M", "D", "R", "M"]);
  });

  it("tells the reviewer a patchless file isn't in the diff", () => {
    expect(fileTooltip(file("logo.png", { hasPatch: false, hunkIds: [] }))).toBe("logo.png\nNot shown in this diff. Open on GitHub.");
  });

  it("counts the files GitHub's listing left out", () => {
    expect(notListedLabel(1)).toBe("1 more file not listed");
    expect(notListedLabel(250)).toBe("250 more files not listed");
  });
});

describe("groups of a path", () => {
  it("lists the reading-path numbers of every group a file appears in, in order", () => {
    const map = groupsOfPath([["a.ts", "b.ts"], ["c.ts"], ["a.ts"], [], ["a.ts", "c.ts"]]);
    expect(map.get("a.ts")).toEqual([1, 3, 5]);
    expect(map.get("b.ts")).toEqual([1]);
    expect(map.get("c.ts")).toEqual([2, 5]);
    expect(map.get("missing.ts")).toBeUndefined();
  });
});

describe("viewedPaths", () => {
  const hunk = (id: string): Hunk => ({ id, fingerprint: `fp-${id}`, fileIndex: 0, header: "", patch: "", additions: 1, deletions: 0 });
  const hunks = new Map(["a1", "a2", "b1"].map((id) => [id, hunk(id)]));
  const files = [file("a.ts", { hunkIds: ["a1", "a2"] }), file("b.ts", { hunkIds: ["b1"] }), file("logo.png", { hunkIds: [] })];

  it("marks a file viewed only when every one of its hunks is viewed", () => {
    expect([...viewedPaths(files, hunks, new Set(["fp-a1", "fp-a2", "fp-b1"]))]).toEqual(["a.ts", "b.ts"]);
  });

  it("leaves a partially viewed file unviewed", () => {
    expect([...viewedPaths(files, hunks, new Set(["fp-a1", "fp-b1"]))]).toEqual(["b.ts"]);
  });

  it("never marks a file without hunks viewed", () => {
    expect(viewedPaths(files, hunks, new Set()).has("logo.png")).toBe(false);
  });
});

describe("topmostPath", () => {
  it("picks the on-screen file section nearest the top, whatever order they arrive in", () => {
    expect(topmostPath([{ path: "b.ts", top: 300 }, { path: "a.ts", top: -40 }, { path: "c.ts", top: 120 }])).toBe("a.ts");
  });

  it("has no current file when no section is on screen", () => {
    expect(topmostPath([])).toBeUndefined();
  });
});
