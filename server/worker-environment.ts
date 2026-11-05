// Where agents that read a pull request run. PR content is untrusted, so these
// workers never get the user's own checkout: they run in a disposable copy of
// the PR's commit, or with no repository at all.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { PrDetails } from "../shared/schema";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { findProject, personalProjectId, type ProjectMatch } from "./projects";
import { clonePrCommit } from "./worker-clone";

type SpawnInput = Parameters<BbPluginApi["sdk"]["threads"]["spawn"]>[0];
type WorkerInput = Pick<SpawnInput, "title" | "visibility" | "permissionMode" | "pluginMetadata"> &
  Partial<Pick<SpawnInput, "providerId" | "model" | "reasoningLevel" | "serviceTier">> & { prompt: string };

export interface ProvisioningTiming {
  timeoutMs: number;
  pollMs: number;
}

const PROVISIONING_TIMING: ProvisioningTiming = { timeoutMs: 30_000, pollMs: 250 };

export interface PrCloneTarget {
  projectId: string;
  hostId: string;
  path: string;
  remoteUrl: string;
}

/**
 * The project and host that can hold a copy of the PR's commit. A fork's commit
 * is not reviewed code from this repository's writers, so fork PRs have no target.
 */
export function prCloneTarget(project: ProjectMatch | null, pr: PrDetails): PrCloneTarget | null {
  if (project === null || project.hostId === null || project.path === null || project.remoteUrl === null || !pr.headInBaseRepo) return null;
  return { projectId: project.projectId, hostId: project.hostId, path: project.path, remoteUrl: project.remoteUrl };
}

export function prCloneEnvironment(hostId: string, path: string) {
  return { type: "host", hostId, workspace: { type: "unmanaged", path } } as const;
}

/**
 * spawn returns before the environment exists, and a failed one only shows up
 * afterwards: the thread errors without ever getting an environment. Past the
 * timeout the worker counts as started, and any later failure is reported as one.
 */
export async function provisioningFailed(bb: BbPluginApi, threadId: string, timing = PROVISIONING_TIMING): Promise<boolean> {
  const deadline = Date.now() + timing.timeoutMs;
  while (Date.now() < deadline) {
    const thread = await bb.sdk.threads.get({ threadId });
    if (thread.status === "error") return thread.environmentId === null;
    // The status can read active or idle before the environment exists, so only an environment proves it.
    if (thread.environmentId !== null && (thread.status === "active" || thread.status === "idle")) return false;
    await new Promise((resolve) => setTimeout(resolve, timing.pollMs));
  }
  return false;
}

/**
 * Spawns a worker in a copy of the PR's commit inside `tempDir`, or in the personal
 * project with no repository when there is no target or the copy cannot be made.
 * The caller owns `tempDir` and deletes it with the worker.
 */
export async function spawnPrWorker(
  bb: BbPluginApi,
  pr: PrDetails,
  tempDir: string,
  buildInput: (hasRepo: boolean) => WorkerInput,
  timing: ProvisioningTiming = PROVISIONING_TIMING,
) {
  const target = prCloneTarget(await findProject(bb, pr.ref), pr);
  if (target !== null) {
    let spawned: string | null = null;
    try {
      const path = await clonePrCommit({ projectPath: target.path, remoteUrl: target.remoteUrl, headSha: pr.headSha, dir: tempDir });
      const thread = await bb.sdk.threads.spawn({
        ...buildInput(true),
        projectId: target.projectId,
        environment: prCloneEnvironment(target.hostId, path),
      });
      spawned = thread.id;
      if (!(await provisioningFailed(bb, thread.id, timing))) return { thread, hasRepo: true };
      bb.log.warn(`copy of ${pr.headSha} failed to start, continuing without a repository`);
    } catch (error) {
      bb.log.warn(`copy of ${pr.headSha} failed, continuing without a repository: ${String(error)}`);
    }
    if (spawned !== null) {
      const threadId = spawned;
      await bb.sdk.threads.archive({ threadId }).catch((error: unknown) => bb.log.warn(`archive worker ${threadId}: ${String(error)}`));
    }
    await rm(join(tempDir, "repo"), { recursive: true, force: true, maxRetries: 5 }).catch((error: unknown) => bb.log.warn(`remove failed copy: ${String(error)}`));
  }
  const thread = await bb.sdk.threads.spawn({
    ...buildInput(false),
    projectId: await personalProjectId(bb),
    environment: { type: "project-default" },
  });
  return { thread, hasRepo: false };
}
