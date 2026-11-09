import { describe, expect, it, vi } from "vitest";
import { billingOrgGraph } from "@coldtea/pr-lens-schema/examples";
import type { PendingComment, StoredComment } from "../shared/schema";
import { createComments, stripMarker } from "./comments";

describe("comment tag markers", () => {
  it("strips a marker left by an older version", () => {
    expect(stripMarker("Needs a test.\n\n<!-- pr-xray: tag=missing-test -->")).toBe("Needs a test.");
  });

  it("leaves other text alone", () => {
    expect(stripMarker("A plain comment.")).toBe("A plain comment.");
    const quoted = "<!-- pr-xray: tag=bug --> is the format";
    expect(stripMarker(quoted)).toBe(quoted);
  });
});

describe("submitting a review", () => {
  const ref = { owner: "acme", repo: "web", number: 7 };
  const draft = (id: string, headSha = "head"): PendingComment => ({
    id,
    createdAt: "2026-11-04T00:00:00.000Z",
    path: "a.ts",
    line: 3,
    side: "RIGHT",
    startLine: null,
    startSide: null,
    body: `draft ${id}`,
    headSha,
  });
  const posted = { id: 1, body: "draft", html_url: "https://github.com/x", path: "a.ts", line: 3 };

  function setup(first: PendingComment[]) {
    const rows = { current: first };
    const store = {
      pendingComments: () => rows.current,
      removePendingComments: (ids: string[]) => {
        rows.current = rows.current.filter((row) => !ids.includes(row.id));
      },
      insertComment: vi.fn(),
      updatePendingComment: vi.fn(),
      updateComment: vi.fn(() => ({ id: "cm_1", source: "diff", ref, githubCommentId: 9, tag: "bug" })),
      commentByGithubId: vi.fn(() => ({ id: "cm_1", tag: "bug" })),
    };
    const github = {
      headSha: vi.fn(async () => "head"),
      submitReview: vi.fn(async () => 42),
      reviewComments: vi.fn(async () => [posted]),
      createComment: vi.fn(async () => posted),
      updateCommentBody: vi.fn(async () => undefined),
    };
    const bb = {
      realtime: { publish: vi.fn() },
      log: { warn: vi.fn() },
      agents: { registerTool: vi.fn() },
      events: { on: vi.fn() },
    };
    const comments = createComments({ bb, store, github, models: {} } as unknown as Parameters<typeof createComments>[0]);
    return { comments, rows, store, github };
  }

  it("records the posted comments and clears the drafts", async () => {
    const { comments, rows, store } = setup([draft("a")]);
    await expect(comments.submitReview(ref, "head", "COMMENT", "")).resolves.toEqual({ posted: 1 });
    expect(rows.current).toEqual([]);
    expect(store.insertComment).toHaveBeenCalledTimes(1);
  });

  it("does not leave drafts to post again when reading the comments back fails", async () => {
    const { comments, rows, github } = setup([draft("a")]);
    github.reviewComments.mockRejectedValueOnce(new Error("GitHub is down"));
    await expect(comments.submitReview(ref, "head", "COMMENT", "")).resolves.toEqual({ posted: 1 });
    expect(rows.current).toEqual([]);
  });

  it("keeps a draft added while the review was being posted", async () => {
    const { comments, rows, github } = setup([draft("a")]);
    github.submitReview.mockImplementationOnce(async () => {
      rows.current = [...rows.current, draft("b")];
      return 42;
    });
    await comments.submitReview(ref, "head", "COMMENT", "");
    expect(rows.current.map((row) => row.id)).toEqual(["b"]);
  });

  it("refuses an approval when the PR moved past the commit the reviewer saw", async () => {
    const { comments, github } = setup([]);
    await expect(comments.submitReview(ref, "seen", "APPROVE", "")).rejects.toThrow("new commits");
    expect(github.submitReview).not.toHaveBeenCalled();
  });

  it("records the review on the commit the reviewer saw", async () => {
    const { comments, github } = setup([]);
    await comments.submitReview(ref, "head", "APPROVE", "");
    expect(github.submitReview).toHaveBeenCalledWith(ref, "head", "APPROVE", "", []);
  });

  it("refuses a draft written on an older commit without posting anything", async () => {
    const { comments, rows, github } = setup([draft("a"), draft("b", "old")]);
    await expect(comments.submitReview(ref, "head", "COMMENT", "")).rejects.toThrow("older commit");
    expect(github.submitReview).not.toHaveBeenCalled();
    expect(rows.current).toHaveLength(2);
  });

  it("moves a draft the user keeps onto the commit they checked it against", async () => {
    const { comments, store } = setup([draft("a", "old")]);
    await comments.keepPending(ref, "a", "head");
    expect(store.updatePendingComment).toHaveBeenCalledWith("a", { headSha: "head" });
  });

  it("won't keep a draft when the PR moved past the commit the user checked", async () => {
    const { comments, store } = setup([draft("a", "old")]);
    await expect(comments.keepPending(ref, "a", "seen")).rejects.toThrow("new commits");
    expect(store.updatePendingComment).not.toHaveBeenCalled();
  });

  it("posts a single comment on the commit it was written on", async () => {
    const { comments, github, store } = setup([]);
    await comments.postSingle(ref, draft("a", "seen"));
    expect(github.createComment).toHaveBeenCalledWith(ref, "seen", expect.objectContaining({ line: 3 }));
    expect(store.insertComment).toHaveBeenCalledWith(expect.objectContaining({ headSha: "seen" }));
  });

  it("keeps tags in bb and never edits the GitHub comment", async () => {
    const { comments, store, github } = setup([]);
    await comments.setTag("cm_1", "bug");
    expect(store.updateComment).toHaveBeenCalledWith("cm_1", { tag: "bug" });
    expect(github.updateCommentBody).not.toHaveBeenCalled();
  });

  it("removes an old tag marker when the user edits a comment", async () => {
    const { comments, github } = setup([]);
    await comments.editBody(ref, 9, "New text\n\n<!-- pr-xray: tag=bug -->");
    expect(github.updateCommentBody).toHaveBeenCalledWith(ref, 9, "New text");
  });

  it("does not read back the comments of a review with no drafts", async () => {
    const { comments, github } = setup([]);
    await expect(comments.submitReview(ref, "head", "APPROVE", "")).resolves.toEqual({ posted: 0 });
    expect(github.reviewComments).not.toHaveBeenCalled();
  });

  it("tags nothing when the comment is gone", () => {
    const { comments, store } = setup([]);
    store.updateComment.mockReturnValueOnce(null as never);
    expect(comments.setTag("cm_gone", "bug")).toBeNull();
  });

  it("keeps the drafts when GitHub rejects the review", async () => {
    const { comments, rows, github } = setup([draft("a")]);
    github.submitReview.mockRejectedValueOnce(new Error("422"));
    await expect(comments.submitReview(ref, "head", "COMMENT", "")).rejects.toThrow("422");
    expect(rows.current.map((row) => row.id)).toEqual(["a"]);
  });
});

describe("diagram comments", () => {
  const ref = { owner: "acme", repo: "web", number: 7 };
  const pin = (id: string, diagramId: string, nodeId: string, status = "open") =>
    ({ id, source: "diagram", ref, diagramId, nodeId, status }) as unknown as StoredComment;

  const current = { id: "an_2", ref, headSha: "head", result: { graph: billingOrgGraph } };

  function setup(pins: StoredComment[], analysis: unknown = current) {
    const store = {
      analysis: () => analysis,
      commentsForPr: () => pins,
      updateComment: vi.fn(),
      insertComment: vi.fn((input: object) => input),
    };
    const bb = { realtime: { publish: vi.fn() }, agents: { registerTool: vi.fn() }, events: { on: vi.fn() } };
    const comments = createComments({ bb, store, github: {}, models: {} } as unknown as Parameters<typeof createComments>[0]);
    return { comments, store, bb };
  }

  // A gone analysis, one with no result yet, and one from before PR Lens that has no diagrams.
  const noDiagrams = [null, { ...current, result: null }, { ...current, result: { summary: "Old." } }];

  it("leaves pins alone when the analysis is gone or has no diagrams", () => {
    noDiagrams.forEach((analysis) => {
      const { comments, store, bb } = setup([pin("node-gone", "architecture-overview", "payment-gateway")], analysis);
      comments.reconcileDiagramPins("an_2");
      expect(store.updateComment).not.toHaveBeenCalled();
      expect(bb.realtime.publish).not.toHaveBeenCalled();
    });
  });

  it("will not pin a comment to an analysis that is gone or has no diagrams", () => {
    noDiagrams.forEach((analysis) => {
      const { comments, store } = setup([], analysis);
      const add = () => comments.addDiagramComment({ ref, analysisId: "an_2", diagramId: "data-model", nodeId: "subscription", body: "Hm." });
      expect(add).toThrow("That diagram node no longer exists.");
      expect(store.insertComment).not.toHaveBeenCalled();
    });
  });

  it("marks pins on nodes and tables gone after a re-run outdated, and keeps the rest open", () => {
    const { comments, store } = setup([
      pin("node-kept", "architecture-overview", "billing-service"),
      pin("node-gone", "architecture-overview", "payment-gateway"),
      pin("table-kept", "data-model", "subscription", "outdated"),
      pin("table-gone", "data-model", "plan"),
      pin("resolved", "data-model", "plan", "resolved"),
    ]);
    comments.reconcileDiagramPins("an_2");
    expect(store.updateComment.mock.calls).toEqual([
      ["node-gone", { status: "outdated" }],
      ["table-kept", { status: "open" }],
      ["table-gone", { status: "outdated" }],
    ]);
  });

  it("pins a comment to a table with its label from the document", () => {
    const { comments, store } = setup([]);
    comments.addDiagramComment({ ref, analysisId: "an_2", diagramId: "data-model", nodeId: "subscription", body: "Split this." });
    expect(store.insertComment).toHaveBeenCalledWith(
      expect.objectContaining({ headSha: "head", diagramId: "data-model", nodeId: "subscription", nodeLabel: "Subscription" }),
    );
  });

  it("rejects ids that are not in the document", () => {
    const { comments, store } = setup([]);
    const add = (diagramId: string, nodeId: string) => () =>
      comments.addDiagramComment({ ref, analysisId: "an_2", diagramId, nodeId, body: "Hm." });
    expect(add("data-model", "plan")).toThrow("That diagram node no longer exists.");
    expect(add("architecture-overview", "subscription")).toThrow("That diagram node no longer exists.");
    expect(add("nope", "billing-service")).toThrow("That diagram node no longer exists.");
    expect(store.insertComment).not.toHaveBeenCalled();
  });
});

describe("AI tagging", () => {
  const ref = { owner: "acme", repo: "web", number: 7 };
  const stored = { id: "cm_1", source: "diff", ref, path: "a.ts", line: 3, nodeLabel: null, body: "Leaks memory.", tag: null as string | null };

  function setup() {
    const comment = { ...stored };
    const handlers = new Map<string, (event: { thread: { id: string } }) => void>();
    const tools: { parameters: { safeParse: (input: unknown) => { success: boolean } }; execute: (input: { tags: { commentId: string; tag: string }[] }, context: { threadId?: string }) => unknown }[] = [];
    const store = {
      comment: vi.fn((id: string) => (id === comment.id ? comment : null)),
      updateComment: vi.fn((_id: string, patch: { tag: string }) => Object.assign(comment, patch)),
    };
    const bb = {
      realtime: { publish: vi.fn() },
      agents: { registerTool: vi.fn((tool) => tools.push(tool)) },
      events: { on: vi.fn((name: string, handler: (event: { thread: { id: string } }) => void) => handlers.set(name, handler)) },
      sdk: {
        projects: { list: vi.fn(async () => [{ id: "personal", kind: "personal" }]) },
        threads: { spawn: vi.fn(async () => ({ id: "worker" })), archive: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) },
      },
    };
    const models = { selected: vi.fn(async () => null) };
    const comments = createComments({ bb, store, github: {}, models } as unknown as Parameters<typeof createComments>[0]);
    const tool = tools[0]!;
    const idle = (threadId: string) => handlers.get("thread.idle")!({ thread: { id: threadId } });
    return { comments, bb, store, tool, idle, comment };
  }

  it("lets the worker tag only its own comment, then finishes when the worker goes idle", async () => {
    const { comments, bb, tool, idle, comment } = setup();
    const tagging = comments.autoTag("cm_1");
    await vi.waitFor(() => expect(bb.sdk.threads.spawn).toHaveBeenCalled());

    await expect(tool.execute({ tags: [{ commentId: "cm_1", tag: "bug" }] }, { threadId: "elsewhere" })).resolves.toMatchObject({ isError: true });
    await expect(tool.execute({ tags: [{ commentId: "cm_1", tag: "bug" }] }, {})).resolves.toMatchObject({ isError: true });
    expect(comment.tag).toBeNull();
    await expect(
      tool.execute({ tags: [{ commentId: "cm_other", tag: "nit" }, { commentId: "cm_1", tag: "bug" }] }, { threadId: "worker" }),
    ).resolves.toBe("Tagged. End your turn now.");
    idle("worker");

    await expect(tagging).resolves.toBeUndefined();
    expect(comment.tag).toBe("bug");
    expect(bb.sdk.threads.archive).toHaveBeenCalledWith({ threadId: "worker" });
    expect(bb.sdk.threads.stop).toHaveBeenCalledWith({ threadId: "worker" });
  });

  it("fails when the worker finishes without a tag", async () => {
    const { comments, bb, idle } = setup();
    const tagging = comments.autoTag("cm_1");
    await vi.waitFor(() => expect(bb.sdk.threads.spawn).toHaveBeenCalled());
    idle("unrelated");
    idle("worker");
    await expect(tagging).rejects.toThrow("AI tagging did not pick a tag.");
  });

  it("gives up when the worker never goes idle, and cleans up its thread", async () => {
    vi.useFakeTimers();
    try {
      const { comments, bb } = setup();
      const tagging = comments.autoTag("cm_1");
      const outcome = expect(tagging).rejects.toThrow("AI tagging did not pick a tag.");
      await vi.waitFor(() => expect(bb.sdk.threads.spawn).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(3 * 60_000);
      await outcome;
      expect(bb.sdk.threads.archive).toHaveBeenCalledWith({ threadId: "worker" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("refuses to tag a comment that is gone", async () => {
    const { comments, bb } = setup();
    await expect(comments.autoTag("cm_gone")).rejects.toThrow("That comment no longer exists.");
    expect(bb.sdk.threads.spawn).not.toHaveBeenCalled();
  });

  it("describes a diff comment by file and line to the worker", async () => {
    const { comments, bb, idle } = setup();
    const tagging = comments.autoTag("cm_1").catch(() => undefined);
    await vi.waitFor(() => expect(bb.sdk.threads.spawn).toHaveBeenCalled());
    idle("worker");
    await tagging;
    const prompt = (bb.sdk.threads.spawn.mock.calls[0] as unknown as [{ prompt: string }])[0].prompt;
    expect(prompt).toContain('"where":"a.ts:3"');
    expect(prompt).toContain('"body":"Leaks memory."');
  });

  it("fails when the comment is deleted while the worker tags it", async () => {
    const { comments, bb, store, idle } = setup();
    const tagging = comments.autoTag("cm_1");
    await vi.waitFor(() => expect(bb.sdk.threads.spawn).toHaveBeenCalled());
    store.comment.mockReturnValue(null);
    idle("worker");
    await expect(tagging).rejects.toThrow("AI tagging did not pick a tag.");
  });

  it("asks the worker for at least one tag", () => {
    const { tool } = setup();
    expect(tool.parameters.safeParse({ tags: [] }).success).toBe(false);
    expect(tool.parameters.safeParse({ tags: [{ commentId: "cm_1", tag: "bug" }] }).success).toBe(true);
  });
});

describe("design comments are only for the PR's author", () => {
  const ref = { owner: "acme", repo: "web", number: 7 };
  const saved = {
    design: { id: "cm_design", source: "diagram", ref },
    diff: { id: "cm_diff", source: "diff", ref },
  } as unknown as Record<string, StoredComment>;

  function setup(isOwnPr: boolean) {
    const store = { comment: (id: string) => Object.values(saved).find((comment) => comment.id === id) ?? null };
    const bb = { realtime: { publish: vi.fn() }, agents: { registerTool: vi.fn() }, events: { on: vi.fn() } };
    const loadPr = vi.fn(async () => ({ isOwnPr }));
    return createComments({ bb, store, github: {}, models: {}, loadPr } as unknown as Parameters<typeof createComments>[0]);
  }

  it("refuses design comments on someone else's PR", async () => {
    const comments = setup(false);
    await expect(comments.requireOwnPr(ref)).rejects.toThrow("Design comments are only available on your own PR.");
    await expect(comments.requireOwnDesignComment("cm_design")).rejects.toThrow("Design comments are only available on your own PR.");
  });

  it("allows design comments on your own PR", async () => {
    const comments = setup(true);
    await expect(comments.requireOwnPr(ref)).resolves.toBeUndefined();
    await expect(comments.requireOwnDesignComment("cm_design")).resolves.toBeUndefined();
  });

  it("leaves diff comments, and comments already gone, to their own checks", async () => {
    const comments = setup(false);
    await expect(comments.requireOwnDesignComment("cm_diff")).resolves.toBeUndefined();
    await expect(comments.requireOwnDesignComment("cm_gone")).resolves.toBeUndefined();
  });
});
