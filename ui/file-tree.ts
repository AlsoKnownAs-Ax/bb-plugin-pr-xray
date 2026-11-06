// The File tree: a PR's changed files arranged by directory, like GitHub's.
import type { Hunk, PrFile } from "../shared/schema";

/** `path` is the deepest folder of a compacted row, so it stays a stable key. */
export type FileTreeDir = { kind: "dir"; name: string; path: string; children: FileTreeNode[]; additions: number; deletions: number };
export type FileTreeFile = { kind: "file"; name: string; file: PrFile };
export type FileTreeNode = FileTreeDir | FileTreeFile;

/** Builds the tree's top-level rows: folders before files, each alphabetical. Files sit under their new path. */
export function buildFileTree(files: PrFile[]): FileTreeNode[] {
  const root = dir("", "");
  for (const file of files) {
    const parts = file.path.split("/");
    let parent = root;
    for (const [i, part] of parts.slice(0, -1).entries()) {
      let next = parent.children.find((child): child is FileTreeDir => child.kind === "dir" && child.name === part);
      if (!next) {
        next = dir(part, parts.slice(0, i + 1).join("/"));
        parent.children.push(next);
      }
      parent = next;
    }
    parent.children.push({ kind: "file", name: parts.at(-1)!, file });
  }
  return finish(root).children;
}

const STATUS: Record<string, { letter: string; label: string }> = {
  added: { letter: "A", label: "Added" },
  removed: { letter: "D", label: "Deleted" },
  renamed: { letter: "R", label: "Renamed" },
  copied: { letter: "C", label: "Copied" },
};
/** GitHub's file status as one letter; anything else (modified, changed) reads as M. */
export const fileStatus = (file: PrFile) => STATUS[file.status] ?? { letter: "M", label: "Modified" };

/** For each path, the 1-based reading-path numbers of the groups it appears in, given each group's paths in order. */
export function groupsOfPath(pathsByGroup: string[][]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  pathsByGroup.forEach((paths, index) => {
    for (const path of paths) map.set(path, [...(map.get(path) ?? []), index + 1]);
  });
  return map;
}

/** The current file: of the file sections on screen, the one nearest the top. */
export const topmostPath = (sections: { path: string; top: number }[]) =>
  sections.reduce<{ path: string; top: number } | undefined>((best, section) => (best && best.top <= section.top ? best : section), undefined)?.path;

export const fileTooltip =(file: PrFile) =>
  (file.previousPath ? `${file.previousPath} → ${file.path}` : file.path) + (isPatchless(file) ? "\nNot shown in this diff. Open on GitHub." : "");

/** Binary or oversized: GitHub gave no patch, so the file has no hunks to jump to. */
export const isPatchless = (file: PrFile) => file.hunkIds.length === 0;

export const notListedLabel = (count: number) => `${count} more file${count === 1 ? "" : "s"} not listed`;

const dir = (name: string, path: string): FileTreeDir => ({ kind: "dir", name, path, children: [], additions: 0, deletions: 0 });

function finish(node: FileTreeDir): FileTreeDir {
  const children = node.children.map((child) => (child.kind === "dir" ? finish(child) : child));
  const only = children[0];
  // Like GitHub, a folder holding just one folder shares its row: `src/server/utils`. Never the root.
  if (node.path !== "" && children.length === 1 && only?.kind === "dir") return { ...only, name: `${node.name}/${only.name}` };
  children.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "dir" ? -1 : 1));
  const counts = children.map((child) => (child.kind === "dir" ? child : child.file));
  return {
    ...node,
    children,
    additions: counts.reduce((sum, child) => sum + child.additions, 0),
    deletions: counts.reduce((sum, child) => sum + child.deletions, 0),
  };
}

/** Paths of files whose every hunk is viewed, across all groups. A file without hunks is never viewed. */
export const viewedPaths = (files: PrFile[], hunks: ReadonlyMap<string, Hunk>, viewedHunks: ReadonlySet<string>) =>
  new Set(
    files
      .filter((file) => file.hunkIds.length > 0 && file.hunkIds.every((id) => viewedHunks.has(hunks.get(id)?.fingerprint ?? "")))
      .map((file) => file.path),
  );
