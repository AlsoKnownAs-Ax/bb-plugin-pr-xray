import { describe, expect, it } from "vitest";
import type { ReviewGet } from "../shared/contract";
import type { Hunk, PendingComment, PrDetails, PrFile, ReviewGroup, ReviewThread } from "../shared/schema";
import { canKeepDraft, displayGroups, draftInDiff, filePatch, filesNotShown, firstChangedLine, hunkFileContext, hunkFileDiff, hunkRange, lineInHunks, sideLines, threadVisibleIn } from "./diff-utils";

function hunk(header: string, body: string[]): Hunk {
  return { id: "h1", path: "a.ts", header, patch: [header, ...body].join("\n"), fingerprint: "f1" } as unknown as Hunk;
}

const sample = hunk("@@ -10,3 +10,4 @@", [" keep", "-old", "+new one", "+new two", " tail"]);

describe("changed files the diff can't show", () => {
  const pr = (changedFiles: number, ...hunkIds: string[][]) =>
    ({ changedFiles, files: hunkIds.map((ids, index) => ({ index, path: `f${index}`, hunkIds: ids })) }) as unknown as PrDetails;

  it("names a file with no patch, even though the reading path skips it", () => {
    const shown = pr(2, ["f0h0"], []);
    expect(filesNotShown(shown).files.map((file) => file.path)).toEqual(["f1"]);
    expect(filesNotShown(shown).unlisted).toBe(0);
  });

  it("counts files GitHub's listing left out", () => {
    expect(filesNotShown(pr(3001, ["f0h0"])).unlisted).toBe(3000);
  });

  it("has nothing to report when every file is in the diff", () => {
    expect(filesNotShown(pr(1, ["f0h0"]))).toEqual({ files: [], unlisted: 0 });
  });
});

describe("reading path after new commits", () => {
  const group = (id: string, kind: ReviewGroup["kind"], ...hunkIds: string[]): ReviewGroup => ({ id, title: id, why: id, kind, hunkIds });
  const current = (hunks: [string, string][]) => hunks.map(([id, fingerprint]) => ({ id, fingerprint }));
  const review = (hunks: [string, string][], groups: ReviewGroup[], hunkFingerprints: Record<string, string> | null) =>
    ({
      pr: {
        headSha: "new",
        hunks: current(hunks),
        files: [{ index: 0, path: "a.ts", hunkIds: hunks.map(([id]) => id) }],
      },
      completed: { headSha: "old", hunkFingerprints, result: { groups } },
    }) as unknown as ReviewGet;

  it("follows a hunk by content when an earlier file moves its id", () => {
    const groups = displayGroups(
      review(
        [["f0h0", "new-file"], ["f1h1", "logic"], ["f1h2", "lockfile"]],
        [group("core", "core", "f0h0"), group("noise", "noise", "f0h1")],
        { f0h0: "logic", f0h1: "lockfile" },
      ),
    );
    expect(groups.map((g) => [g.id, g.hunkIds])).toEqual([
      ["core", ["f1h1"]],
      ["noise", ["f1h2"]],
      ["__new", ["f0h0"]],
    ]);
  });

  it("moves a hunk whose content changed out of its old group", () => {
    const groups = displayGroups(review([["f0h0", "edited"]], [group("core", "core", "f0h0")], { f0h0: "logic" }));
    expect(groups.map((g) => [g.id, g.hunkIds])).toEqual([["__new", ["f0h0"]]]);
  });

  it("shows identical hunks once each", () => {
    const groups = displayGroups(
      review(
        [["f0h0", "same"], ["f0h1", "same"], ["f0h2", "same"]],
        [group("one", "core", "f0h0"), group("two", "tests", "f0h1")],
        { f0h0: "same", f0h1: "same" },
      ),
    );
    expect(groups.flatMap((g) => g.hunkIds).sort()).toEqual(["f0h0", "f0h1", "f0h2"]);
  });

  it("falls back to files when an old analysis saved no fingerprints", () => {
    const groups = displayGroups(review([["f0h0", "logic"]], [group("noise", "noise", "f0h0")], null));
    expect(groups.map((g) => [g.id, g.hunkIds])).toEqual([["file-0", ["f0h0"]]]);
    expect(groups[0]!.why).toContain("too old");
  });
});

describe("where a pending comment shows", () => {
  const comment = { side: "RIGHT", line: 11, headSha: "head", startLine: null, startSide: null } as PendingComment;

  it("can be kept on a newer commit only if its whole range is in the diff", () => {
    expect(canKeepDraft(comment, "newer", [sample])).toBe(true);
    expect(canKeepDraft({ ...comment, startLine: 2, startSide: "RIGHT" }, "newer", [sample])).toBe(false);
    expect(canKeepDraft({ ...comment, startLine: 10, startSide: "RIGHT" }, "newer", [sample])).toBe(true);
    expect(canKeepDraft(comment, "head", [sample])).toBe(false);
  });

  it("shows inline when written on this commit and the line is in the diff", () => {
    expect(draftInDiff(comment, "head", [sample])).toBe(true);
  });

  it("does not show inline when written on another commit", () => {
    expect(draftInDiff(comment, "newer", [sample])).toBe(false);
  });

  it("does not show inline when the line left the diff", () => {
    expect(draftInDiff({ ...comment, line: 500 }, "head", [sample])).toBe(false);
  });
});

describe("hunk line helpers", () => {
  it("reads the ranges from the header", () => {
    expect(hunkRange(sample)).toEqual({ oldStart: 10, oldEnd: 12, newStart: 10, newEnd: 13 });
  });

  it("checks line membership per side", () => {
    expect(lineInHunks([sample], "RIGHT", 13)).toBe(true);
    expect(lineInHunks([sample], "RIGHT", 14)).toBe(false);
    expect(lineInHunks([sample], "LEFT", 12)).toBe(true);
    expect(lineInHunks([sample], "LEFT", 13)).toBe(false);
  });

  it("finds the first changed line", () => {
    expect(firstChangedLine(sample)).toEqual({ side: "LEFT", line: 11 });
  });

  it("returns the source lines of a side", () => {
    expect(sideLines([sample], "RIGHT", 11, 12)).toEqual(["new one", "new two"]);
    expect(sideLines([sample], "LEFT", 11, 11)).toEqual(["old"]);
  });

  it("returns null when a line is outside the hunks", () => {
    expect(sideLines([sample], "RIGHT", 50, 51)).toBeNull();
  });
});

describe("a one-file patch", () => {
  const file = (status: string, previousPath: string | null = null) => ({ path: "b.ts", previousPath, status }) as unknown as PrFile;

  it("names both paths of a rename and holds only the given hunks", () => {
    expect(filePatch(file("renamed", "a.ts"), [sample])).toBe(`diff --git a/a.ts b/b.ts\n--- a/a.ts\n+++ b/b.ts\n${sample.patch}\n`);
  });

  it("uses /dev/null for the missing side of an added or removed file", () => {
    expect(filePatch(file("added"), []).split("\n").slice(1, 3)).toEqual(["--- /dev/null", "+++ b/b.ts"]);
    expect(filePatch(file("removed"), []).split("\n").slice(1, 3)).toEqual(["--- a/b.ts", "+++ /dev/null"]);
  });
});

describe("a review thread in the diff", () => {
  const thread = (path: string, line: number | null) => ({ path, line, side: "RIGHT" }) as unknown as ReviewThread;

  it("shows on its file when its line is in the hunks", () => {
    expect(threadVisibleIn(thread("a.ts", 11), "a.ts", [sample])).toBe(true);
    expect(threadVisibleIn(thread("b.ts", 11), "a.ts", [sample])).toBe(false);
    expect(threadVisibleIn(thread("a.ts", null), "a.ts", [sample])).toBe(false);
    expect(threadVisibleIn(thread("a.ts", 99), "a.ts", [sample])).toBe(false);
  });
});

describe("a hunk with the file above it", () => {
  const withId = (id: string, header: string, body: string[]) => ({ ...hunk(header, body), id });
  const change = withId("h1", "@@ -2,3 +3,4 @@", [" b", " c", "+NEW", " d"]);

  it("gives both sides from the first line, with the hunk renumbered after the shorter side above it", () => {
    const earlier = withId("h0", "@@ -1,1 +1,2 @@", [" a", "+A2"]);
    expect(hunkFileContext("a\nA2\nb\nc\nNEW\nd\ne", [earlier, change], change)).toEqual({
      oldText: "a\nb\nc\nd\n",
      newText: "a\nb\nc\nNEW\nd\n",
      patch: "@@ -2,3 +2,4 @@\n b\n c\n+NEW\n d",
    });
  });

  it("skips no-newline markers", () => {
    const last = withId("h1", "@@ -2,1 +2,2 @@", [" b", "+c", "\\ No newline at end of file"]);
    expect(hunkFileContext("a\nb\nc", [last], last)?.newText).toBe("a\nb\nc\n");
  });

  it("works for a hunk that only adds lines, or only removes them", () => {
    const added = withId("h1", "@@ -2,0 +3,1 @@", ["+NEW"]);
    expect(hunkFileContext("a\nb\nNEW\nc", [added], added)).toEqual({ oldText: "a\nb\n", newText: "a\nb\nNEW\n", patch: "@@ -2,0 +3,1 @@\n+NEW" });
    const removed = withId("h1", "@@ -2,1 +1,0 @@", ["-b"]);
    expect(hunkFileContext("a\nc", [removed], removed)).toEqual({ oldText: "a\nb\n", newText: "a\n", patch: "@@ -2,1 +1,0 @@\n-b" });
  });

  it("parses into a diff that carries the code above but keeps the real line numbers", () => {
    const file = { path: "a.ts", previousPath: null, status: "modified" } as unknown as PrFile;
    const added = withId("h1", "@@ -2,0 +3,1 @@", ["+NEW"]);
    const withContext = hunkFileDiff(file, [added], added, "a\nb\nNEW\nc");
    expect(withContext.isPartial).toBe(false);
    expect(withContext.hunks[0]?.additionStart).toBe(3);
    const alone = hunkFileDiff(file, [added], added, null);
    expect(alone.isPartial).toBe(true);
    expect(alone.hunks[0]?.additionStart).toBe(3);
    expect(hunkFileDiff(file, [added], added, "unrelated").isPartial).toBe(true);
    const removed = withId("h1", "@@ -2,1 +1,0 @@", ["-b"]);
    const deletion = hunkFileDiff(file, [removed], removed, "a\nc");
    expect(deletion.isPartial).toBe(false);
    expect(deletion.hunks[0]?.deletionStart).toBe(2);
  });

  it("is null when the file text doesn't match the hunks", () => {
    expect(hunkFileContext("a\nb\nX\nNEW\nd", [change], change)).toBeNull();
    expect(hunkFileContext("a", [change], change)).toBeNull();
    expect(hunkFileContext("a\nb\nc\nNEW\nd", [change], { ...change, id: "missing" })).toBeNull();
  });
});
