// A private copy of a PR's commit for one agent. bb runs a branch's .bb-env-setup.sh in any
// worktree it creates (seen in a live test), so a bb worktree of an unreviewed branch would run its code.
// bb runs no hooks in a folder it is only pointed at, and this copy shares nothing with the
// user's repository: no hardlinks, config or hooks. Their checkout and other agents are untouched.
import { execFile } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const GIT_TIMEOUT_MS = 180_000;
const COMMIT_ID = /^[0-9a-f]{40}$/u;

function git(args: string[]) {
  return run("git", args, { timeout: GIT_TIMEOUT_MS, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
}

async function hasCommit(path: string, sha: string): Promise<boolean> {
  try {
    await git(["-C", path, "cat-file", "-e", `${sha}^{commit}`]);
    return true;
  } catch {
    return false;
  }
}

/** Creates `<dir>/repo` at `headSha`, with origin pointing at `remoteUrl`, and returns its path. */
export async function clonePrCommit(input: { projectPath: string; remoteUrl: string; headSha: string; dir: string }): Promise<string> {
  const { projectPath, remoteUrl, headSha, dir } = input;
  if (!COMMIT_ID.test(headSha)) throw new Error(`Not a commit id: ${headSha}`);
  const path = join(dir, "repo");
  // Cloning from the checkout is much faster than from GitHub. An empty template leaves out hooks.
  await git(["clone", "--quiet", "--no-checkout", "--no-hardlinks", "--template=", "--", projectPath, path]);
  await git(["-C", path, "remote", "set-url", "origin", remoteUrl]);
  if (!(await hasCommit(path, headSha))) await git(["-C", path, "fetch", "--quiet", "--no-tags", "origin", headSha]);
  await git(["-C", path, "checkout", "--quiet", "--detach", headSha]);
  return path;
}
