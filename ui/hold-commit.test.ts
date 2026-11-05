import { describe, expect, it } from "vitest";
import type { ReviewGet } from "../shared/contract";
import { holdShownCommit, viewedRows } from "./hold-commit";

const thread = (id: string, line: number) => ({ id, path: "a.ts", line, startLine: null, side: "RIGHT", isResolved: false, isOutdated: false, comments: [] });
const hunk = (id: string, fingerprint: string, fileIndex = 0) => ({ id, fingerprint, fileIndex });
const review = (headSha: string, code: string, threads: unknown[] = [], changedSinceViewed: string[] = []) =>
  ({
    pr: { headSha, title: `title ${headSha}`, changedFiles: 1, files: [{ index: 0, path: `${code}.ts` }], hunks: [hunk("h0", code)], threads },
    changedSinceViewed,
    pending: [],
  }) as unknown as ReviewGet;

describe("holding the commit the user is reading", () => {
  it("shows the first load as it is", () => {
    const latest = review("a", "old");
    expect(holdShownCommit(null, latest)).toBe(latest);
  });

  it("takes everything from a refetch of the same commit", () => {
    const latest = review("a", "old", [thread("t", 3)]);
    expect(holdShownCommit(review("a", "old"), latest)).toBe(latest);
  });

  it("keeps the shown code when a refetch brings a new commit", () => {
    const held = holdShownCommit(review("a", "old"), review("b", "new"));
    expect(held.pr.headSha).toBe("a");
    expect(held.pr.files[0]!.path).toBe("old.ts");
    expect(held.pr.hunks[0]!.fingerprint).toBe("old");
  });

  it("still takes what isn't the code, like the title and a new comment", () => {
    const held = holdShownCommit(review("a", "old"), review("b", "new", [thread("new-thread", 9)]));
    expect(held.pr.title).toBe("title b");
    expect(held.pr.threads.map((item) => item.id)).toEqual(["new-thread"]);
  });

  it("keeps an existing comment on the line it has in the shown code", () => {
    const held = holdShownCommit(review("a", "old", [thread("t", 3)]), review("b", "new", [thread("t", 40)]));
    expect(held.pr.threads[0]!.line).toBe(3);
  });

  it("doesn't flag files as updated until the user takes the new code", () => {
    const held = holdShownCommit(review("a", "old", [], []), review("b", "new", [], ["old.ts"]));
    expect(held.changedSinceViewed).toEqual([]);
  });

  it("stays on the same commit through repeated refetches", () => {
    const once = holdShownCommit(review("a", "old"), review("b", "new"));
    expect(holdShownCommit(once, review("c", "newer")).pr.headSha).toBe("a");
  });
});

describe("marking shown code as viewed", () => {
  const pr = {
    files: [{ index: 0, path: "a.ts" }, { index: 1, path: "b.ts" }],
    hunks: [hunk("h0", "fa", 0), hunk("h1", "fb", 1)],
  } as unknown as ReviewGet["pr"];

  it("sends the path of each marked hunk and every hunk in the shown code", () => {
    expect(viewedRows(pr, ["fb"])).toEqual({ hunks: [{ path: "b.ts", fingerprint: "fb" }], current: ["fa", "fb"] });
  });
});
