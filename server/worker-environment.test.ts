import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { describe, expect, it, vi } from "vitest";
import type { PrDetails } from "../shared/schema";
import { prCloneEnvironment, prCloneTarget, spawnPrWorker } from "./worker-environment";
import { clonePrCommit } from "./worker-clone";

vi.mock("./worker-clone", () => ({ clonePrCommit: vi.fn(async ({ dir }: { dir: string }) => `${dir}/repo`) }));

const pr = {
  ref: { owner: "acme", repo: "web", number: 7 },
  headRef: "feature",
  headSha: "a".repeat(40),
  headInBaseRepo: true,
} as PrDetails;
const forkPr = { ...pr, headInBaseRepo: false } as PrDetails;
const project = { projectId: "proj_web", projectName: "web", hostId: "host_1", path: "/code/web", remoteUrl: "git@github.com:acme/web.git" };
const input = { prompt: "go", title: "t" };

const webProject = {
  id: "proj_web",
  name: "web",
  gitRemoteUrl: "git@github.com:acme/web.git",
  sources: [{ type: "local_path", hostId: "host_1", path: "/code/web", isDefault: true }],
};

const started = vi.fn(async () => ({ status: "active", environmentId: "env_1" }));
const fastTiming = { timeoutMs: 50, pollMs: 1 };

function fakeBb(spawn: ReturnType<typeof vi.fn>, projects: unknown[] = [webProject], get: ReturnType<typeof vi.fn> = started) {
  const personal = { id: "proj_personal", name: "Personal", kind: "personal" };
  return {
    log: { warn: vi.fn() },
    storage: { kv: { get: vi.fn(async () => undefined), set: vi.fn(async () => undefined) } },
    sdk: {
      projects: { list: vi.fn(async () => [...projects, personal]) },
      threads: { spawn, get, archive: vi.fn(async () => ({})) },
    },
  } as unknown as BbPluginApi;
}

const personalSpawn = { ...input, projectId: "proj_personal", environment: { type: "project-default" } };

describe("prCloneTarget", () => {
  it("targets the matching project's host", () => {
    expect(prCloneTarget(project, pr)).toEqual({ projectId: "proj_web", hostId: "host_1", path: "/code/web", remoteUrl: "git@github.com:acme/web.git" });
  });

  it("has no target without a project, a host, or a branch in the base repository", () => {
    expect(prCloneTarget(null, pr)).toBeNull();
    expect(prCloneTarget({ ...project, hostId: null }, pr)).toBeNull();
    expect(prCloneTarget(project, forkPr)).toBeNull();
    expect(prCloneTarget({ ...project, path: null }, pr)).toBeNull();
  });
});

describe("spawnPrWorker", () => {
  it("archives the first worker when a check after spawn throws", async () => {
    const spawn = vi.fn(async () => ({ id: "thr_1" }));
    const get = vi.fn(async () => {
      throw new Error("daemon restarting");
    });
    const bb = fakeBb(spawn, [webProject], get);
    const result = await spawnPrWorker(bb, pr, "/tmp/w", () => input, fastTiming);
    expect(result.hasRepo).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(bb.sdk.threads.archive).toHaveBeenCalledWith({ threadId: "thr_1" });
  });

  it("keeps waiting while the thread is active but has no worktree yet", async () => {
    const spawn = vi.fn(async () => ({ id: "thr_1" }));
    const get = vi
      .fn()
      .mockResolvedValueOnce({ status: "active", environmentId: null })
      .mockResolvedValue({ status: "error", environmentId: null });
    const result = await spawnPrWorker(fakeBb(spawn, [webProject], get), pr, "/tmp/w", () => input, fastTiming);
    expect(result.hasRepo).toBe(false);
  });

  it("runs in a private copy of the PR's commit, never a bb worktree or the checkout", async () => {
    const spawn = vi.fn(async () => ({ id: "thr_1" }));
    const result = await spawnPrWorker(fakeBb(spawn), pr, "/tmp/w", () => input);
    expect(result.hasRepo).toBe(true);
    expect(clonePrCommit).toHaveBeenCalledWith({ projectPath: "/code/web", remoteUrl: "git@github.com:acme/web.git", headSha: pr.headSha, dir: "/tmp/w" });
    expect(spawn).toHaveBeenCalledExactlyOnceWith({
      ...input,
      projectId: "proj_web",
      environment: prCloneEnvironment("host_1", "/tmp/w/repo"),
    });
    expect(JSON.stringify(spawn.mock.calls)).not.toContain("managed-worktree");
    expect(JSON.stringify(spawn.mock.calls)).not.toContain("/code/web");
  });

  it("falls back to no repository when the copy can't be made", async () => {
    vi.mocked(clonePrCommit).mockRejectedValueOnce(new Error("no such path"));
    const spawn = vi.fn(async () => ({ id: "thr_2" }));
    const result = await spawnPrWorker(fakeBb(spawn), pr, "/tmp/w", () => input);
    expect(result).toEqual({ thread: { id: "thr_2" }, hasRepo: false });
    expect(spawn).toHaveBeenCalledExactlyOnceWith(personalSpawn);
  });

  it("uses the personal project with no repository for a fork", async () => {
    const spawn = vi.fn(async () => ({ id: "thr_1" }));
    const build = vi.fn(() => input);
    const result = await spawnPrWorker(fakeBb(spawn), forkPr, "/tmp/w", build);
    expect(result.hasRepo).toBe(false);
    expect(build).toHaveBeenCalledExactlyOnceWith(false);
    expect(spawn).toHaveBeenCalledExactlyOnceWith(personalSpawn);
  });

  it("uses the personal project when no project matches the repository", async () => {
    const spawn = vi.fn(async () => ({ id: "thr_1" }));
    const result = await spawnPrWorker(fakeBb(spawn, []), pr, "/tmp/w", () => input);
    expect(result.hasRepo).toBe(false);
    expect(spawn).toHaveBeenCalledExactlyOnceWith(personalSpawn);
  });

  it("falls back when the worktree fails after spawn returned, and archives the failed thread", async () => {
    const spawn = vi.fn();
    spawn.mockResolvedValueOnce({ id: "thr_1" });
    spawn.mockResolvedValueOnce({ id: "thr_2" });
    const get = vi.fn();
    get.mockResolvedValueOnce({ status: "starting", environmentId: null });
    get.mockResolvedValueOnce({ status: "error", environmentId: null });
    const bb = fakeBb(spawn, [webProject], get);
    const result = await spawnPrWorker(bb, pr, "/tmp/w", () => input, fastTiming);
    expect(result).toEqual({ thread: { id: "thr_2" }, hasRepo: false });
    expect(bb.sdk.threads.archive).toHaveBeenCalledWith({ threadId: "thr_1" });
    expect(spawn).toHaveBeenLastCalledWith(personalSpawn);
  });

  it("keeps a worker that errored after it got its environment", async () => {
    const spawn = vi.fn(async () => ({ id: "thr_1" }));
    const get = vi.fn(async () => ({ status: "error", environmentId: "env_1" }));
    const result = await spawnPrWorker(fakeBb(spawn, [webProject], get), pr, "/tmp/w", () => input, fastTiming);
    expect(result.hasRepo).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("counts a worker as started after the timeout", async () => {
    const spawn = vi.fn(async () => ({ id: "thr_1" }));
    const get = vi.fn(async () => ({ status: "starting", environmentId: null }));
    const result = await spawnPrWorker(fakeBb(spawn, [webProject], get), pr, "/tmp/w", () => input, fastTiming);
    expect(result.hasRepo).toBe(true);
    expect(spawn).toHaveBeenCalledTimes(1);
  });

  it("falls back to no repository when the worktree cannot be created", async () => {
    const spawn = vi.fn();
    spawn.mockRejectedValueOnce(new Error("no such branch"));
    spawn.mockResolvedValueOnce({ id: "thr_2" });
    const result = await spawnPrWorker(fakeBb(spawn), pr, "/tmp/w", () => input);
    expect(result).toEqual({ thread: { id: "thr_2" }, hasRepo: false });
    expect(spawn).toHaveBeenLastCalledWith(personalSpawn);
  });
});
