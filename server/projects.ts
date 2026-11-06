// Maps a PR's repository to the bb project that holds a checkout of it.
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { PrRef } from "../shared/schema";

export interface ProjectMatch {
  projectId: string;
  projectName: string;
  hostId: string | null;
  path: string | null;
  remoteUrl: string | null;
}

function normalizeRemote(url: string): string | null {
  const match = /github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/iu.exec(url.trim());
  return match === null ? null : `${match[1]}/${match[2]}`.toLowerCase();
}

export async function findProject(bb: BbPluginApi, ref: PrRef): Promise<ProjectMatch | null> {
  const wanted = `${ref.owner}/${ref.repo}`.toLowerCase();
  const projects = (await bb.sdk.projects.list()) as ListedProject[];
  const project = projects.find((candidate) => candidate.gitRemoteUrl && normalizeRemote(candidate.gitRemoteUrl) === wanted);
  if (!project?.gitRemoteUrl) {
    return null;
  }

  const sources = project.sources ?? [];
  const source = sources.find((candidate) => candidate.isDefault) ?? sources[0];
  return {
    projectId: project.id,
    projectName: project.name,
    hostId: source?.hostId ?? null,
    path: localPath(source),
    remoteUrl: project.gitRemoteUrl,
  };
}

type ProjectSource = { type: string; hostId: string; path?: string; isDefault?: boolean };
/** The fields of a listed project we read; the SDK's type leaves them out. */
type ListedProject = { id: string; name: string; gitRemoteUrl?: string | null; sources?: ProjectSource[] };

function localPath(source: ProjectSource | undefined): string | null {
  if (source?.type !== "local_path") {
    return null;
  }

  return source.path ?? null;
}

export async function personalProjectId(bb: BbPluginApi): Promise<string> {
  const projects = await bb.sdk.projects.list({ includePersonal: true });
  const personal = projects.find((project) => (project as { kind?: string }).kind === "personal");
  if (personal === undefined) throw new Error("No personal project to run the analysis in.");
  return personal.id;
}
