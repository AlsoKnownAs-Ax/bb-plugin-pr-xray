import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clonePrCommit } from "./worker-clone";
import { createWorkerDir, removeFilesWhenArchived, removeWorkerDir } from "./worker-files";

let root: string;
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();

function repo(name: string): string {
  const path = join(root, name);
  execFileSync("git", ["init", "-q", path]);
  git(path, "config", "user.name", "test");
  git(path, "config", "user.email", "test@example.invalid");
  git(path, "config", "core.autocrlf", "false");
  return path;
}

function commit(path: string, file: string, content: string): string {
  writeFileSync(join(path, file), content);
  git(path, "add", file);
  git(path, "commit", "-q", "-m", `change ${file}`);
  return git(path, "rev-parse", "HEAD");
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "clone-test-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("clonePrCommit", () => {
  it("checks out exactly the PR's commit, not the checkout's current one", async () => {
    const source = repo("source");
    const headSha = commit(source, "a.txt", "reviewed");
    commit(source, "a.txt", "newer");
    const path = await clonePrCommit({ projectPath: source, remoteUrl: "https://github.com/acme/web.git", headSha, dir: join(root, "worker") });
    expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("reviewed");
    expect(git(path, "rev-parse", "HEAD")).toBe(headSha);
  });

  it("leaves the user's checkout on its branch with its files", async () => {
    const source = repo("source");
    const headSha = commit(source, "a.txt", "reviewed");
    commit(source, "a.txt", "mine");
    const branch = git(source, "branch", "--show-current");
    await clonePrCommit({ projectPath: source, remoteUrl: "https://github.com/acme/web.git", headSha, dir: join(root, "worker") });
    expect(git(source, "branch", "--show-current")).toBe(branch);
    expect(readFileSync(join(source, "a.txt"), "utf8")).toBe("mine");
  });

  it("points origin at GitHub, so a fix agent's push doesn't go to the user's checkout", async () => {
    const source = repo("source");
    const headSha = commit(source, "a.txt", "x");
    const path = await clonePrCommit({ projectPath: source, remoteUrl: "https://github.com/acme/web.git", headSha, dir: join(root, "worker") });
    expect(git(path, "remote", "get-url", "origin")).toBe("https://github.com/acme/web.git");
  });

  it("doesn't run or inherit anything from the branch or the user's repository", async () => {
    const source = repo("source");
    const marker = join(root, "ran").replaceAll("\\", "/");
    const headSha = commit(source, ".bb-env-setup.sh", `echo ran > "${marker}"\n`);
    git(source, "config", "core.hooksPath", "planted");
    const path = await clonePrCommit({ projectPath: source, remoteUrl: "https://github.com/acme/web.git", headSha, dir: join(root, "worker") });
    expect(existsSync(join(path, ".bb-env-setup.sh"))).toBe(true);
    expect(existsSync(marker)).toBe(false);
    expect(readFileSync(join(path, ".git", "config"), "utf8")).not.toContain("planted");
    expect(existsSync(join(path, ".git", "hooks"))).toBe(false);
  });

  it("fetches a commit the user's checkout doesn't have yet", async () => {
    const source = repo("source");
    commit(source, "a.txt", "old");
    const remote = repo("remote");
    git(remote, "config", "uploadpack.allowAnySHA1InWant", "true");
    git(remote, "pull", "-q", source);
    const headSha = commit(remote, "a.txt", "pushed");
    const path = await clonePrCommit({ projectPath: source, remoteUrl: remote, headSha, dir: join(root, "worker") });
    expect(readFileSync(join(path, "a.txt"), "utf8")).toBe("pushed");
  });

  it("can be deleted with its worker's folder, read-only git files included", async () => {
    const source = repo("source");
    const headSha = commit(source, "a.txt", "x");
    const dir = await createWorkerDir();
    await clonePrCommit({ projectPath: source, remoteUrl: "u", headSha, dir });
    await removeWorkerDir(dir);
    expect(existsSync(dir)).toBe(false);
  });

  it("is deleted when its thread is archived", async () => {
    const source = repo("source");
    const headSha = commit(source, "a.txt", "x");
    const dir = await createWorkerDir();
    await clonePrCommit({ projectPath: source, remoteUrl: "u", headSha, dir });
    let archived: ((event: { thread: { id: string } }) => Promise<void>) | undefined;
    removeFilesWhenArchived({
      log: { warn: () => undefined },
      events: { on: (_name: string, handler: typeof archived) => (archived = handler) },
      sdk: { threads: { getPluginMetadata: async () => ({ tempDir: dir }) } },
    } as unknown as Parameters<typeof removeFilesWhenArchived>[0]);
    await archived!({ thread: { id: "thr_1" } });
    expect(existsSync(dir)).toBe(false);
  });

  it("refuses anything that isn't a commit id", async () => {
    const source = repo("source");
    commit(source, "a.txt", "x");
    await expect(clonePrCommit({ projectPath: source, remoteUrl: "u", headSha: "--upload-pack=evil", dir: join(root, "worker") })).rejects.toThrow("commit id");
  });
});
