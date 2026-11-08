// Patch helpers for rendering hunk subsets and anchoring comments.
import { getSingularPatch, processFile } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs";
import type { ReviewGet } from "../shared/contract";
import type { Hunk, PendingComment, PrDetails, PrFile, ReviewGroup, ReviewThread } from "../shared/schema";

export interface HunkRange {
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

const HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u;

export function hunkRange(hunk: Hunk): HunkRange {
  const match = HEADER.exec(hunk.header);
  if (match === null) return { oldStart: 0, oldEnd: -1, newStart: 0, newEnd: -1 };
  const oldStart = Number(match[1]);
  const oldCount = match[2] === undefined ? 1 : Number(match[2]);
  const newStart = Number(match[3]);
  const newCount = match[4] === undefined ? 1 : Number(match[4]);
  return { oldStart, oldEnd: oldStart + oldCount - 1, newStart, newEnd: newStart + newCount - 1 };
}

/** A git patch for one file containing only the given hunks. */
export function filePatch(file: PrFile, hunks: Hunk[]): string {
  const oldPath = file.previousPath ?? file.path;
  const header = [
    `diff --git a/${oldPath} b/${file.path}`,
    file.status === "added" ? "--- /dev/null" : `--- a/${oldPath}`,
    file.status === "removed" ? "+++ /dev/null" : `+++ b/${file.path}`,
  ];
  return `${header.join("\n")}\n${hunks.map((hunk) => hunk.patch.replace(/\n$/u, "")).join("\n")}\n`;
}

/**
 * Both sides of a file from its first line to the end of `target`, so `target`
 * can be highlighted knowing what came before it: a hunk that starts inside a
 * docstring or block comment would otherwise read its closing delimiter as an
 * opening one. The old side comes from undoing the patch, which keeps it in step
 * with the hunks. Null when the new text doesn't match them.
 *
 * The diff is built from this hunk alone, and @pierre/diffs takes the lines above
 * its only hunk to be the same count on both sides. If they aren't, its highlighted
 * lines drift from the diff, and rows past the end of them throw in processDiffResult.
 * Earlier hunks that add or remove lines break that, so both sides get the shorter
 * side's lines above the hunk, and `patch` is the hunk renumbered to start after them.
 * Those lines are never shown, and they leave both sides in the same syntax state
 * unless an earlier hunk changed a delimiter without closing it.
 */
export function hunkFileContext(newText: string, fileHunks: Hunk[], target: Hunk): { oldText: string; newText: string; patch: string } | null {
  const newLines = newText.split("\n");
  const replay: Replay = { oldLines: [], newIndex: 0 };
  for (const hunk of fileHunks) {
    const range = hunkRange(hunk);
    const above = replayHunk(hunk, range, newLines, replay);
    if (!above) {
      return null;
    }

    if (hunk.id !== target.id) {
      continue;
    }

    if (replay.oldLines.length !== lastLine(range.oldStart, range.oldEnd) || replay.newIndex !== lastLine(range.newStart, range.newEnd)) {
      return null;
    }

    return alignedContext(hunk, newLines, replay, above);
  }

  return null;
}

/** The old side rebuilt so far, and how far into the new side's lines it has got. */
type Replay = { oldLines: string[]; newIndex: number };
type LinesAbove = { old: number; new: number };

/** Replays one hunk onto `replay`: the lines above it on each side, or null when the new text doesn't match. */
function replayHunk(hunk: Hunk, range: HunkRange, newLines: string[], replay: Replay): LinesAbove | null {
  const gapEnd = linesBefore(range.newStart, range.newEnd);
  if (gapEnd < replay.newIndex || gapEnd > newLines.length) {
    return null;
  }

  replay.oldLines.push(...newLines.slice(replay.newIndex, gapEnd));
  replay.newIndex = gapEnd;
  const above = { old: replay.oldLines.length, new: replay.newIndex };
  const patchLines = hunk.patch
    .split("\n")
    .slice(1)
    .filter((raw) => raw !== "" && !raw.startsWith("\\"));
  for (const raw of patchLines) {
    if (!replayLine(raw, newLines, replay)) {
      return null;
    }
  }

  return above;
}

/** Applies one patch line backwards; false when a context or added line isn't the new text's next line. */
function replayLine(raw: string, newLines: string[], replay: Replay): boolean {
  const text = raw.slice(1);
  if (raw.startsWith("-")) {
    replay.oldLines.push(text);
    return true;
  }

  if (newLines[replay.newIndex] !== text) {
    return false;
  }

  if (!raw.startsWith("+")) {
    replay.oldLines.push(text);
  }

  replay.newIndex += 1;
  return true;
}

// An empty side's header names the line before the hunk, not its first line.
function linesBefore(start: number, end: number): number {
  if (end < start) {
    return start;
  }

  return start - 1;
}

function lastLine(start: number, end: number): number {
  if (end < start) {
    return start;
  }

  return end;
}

function alignedContext(hunk: Hunk, newLines: string[], replay: Replay, above: LinesAbove): { oldText: string; newText: string; patch: string } {
  const sharedAbove = sharedLinesAbove(replay.oldLines, newLines, above);
  const oldHunkLines = replay.oldLines.slice(above.old);
  const newHunkLines = newLines.slice(above.new, replay.newIndex);
  const start = sharedAbove.length + 1;
  const header = `@@ -${headerStart(start, oldHunkLines.length)},${oldHunkLines.length} +${headerStart(start, newHunkLines.length)},${newHunkLines.length} @@`;
  return {
    oldText: `${[...sharedAbove, ...oldHunkLines].join("\n")}\n`,
    newText: `${[...sharedAbove, ...newHunkLines].join("\n")}\n`,
    patch: hunk.patch.replace(HEADER, header),
  };
}

/** The shorter side's lines above the hunk, used for both sides. */
function sharedLinesAbove(oldLines: string[], newLines: string[], above: LinesAbove): string[] {
  if (above.old <= above.new) {
    return oldLines.slice(0, above.old);
  }

  return newLines.slice(0, above.new);
}

function headerStart(start: number, count: number): number {
  if (count === 0) {
    return start - 1;
  }

  return start;
}

/**
 * The parsed diff of one hunk, carrying the code above it when `newText` is known
 * and matches the hunks. Otherwise the hunk is highlighted on its own.
 */
export function hunkFileDiff(file: PrFile, fileHunks: Hunk[], hunk: Hunk, newText: string | null): FileDiffMetadata {
  const hunkOnly = getSingularPatch(filePatch(file, [hunk]));
  if (newText === null) return hunkOnly;
  const context = hunkFileContext(newText, fileHunks, hunk);
  if (context === null) return hunkOnly;
  const withContext = processFile(filePatch(file, [{ ...hunk, patch: context.patch }]), {
    oldFile: { name: file.previousPath ?? file.path, contents: context.oldText },
    newFile: { name: file.path, contents: context.newText },
  });
  const alignedHunk = withContext?.hunks[0];
  const realHunk = hunkOnly.hunks[0];
  if (withContext === undefined || alignedHunk === undefined || realHunk === undefined) return hunkOnly;
  // Line indexes stay aligned for the highlighter; the gutter and comments need the real numbers.
  alignedHunk.deletionStart = realHunk.deletionStart;
  alignedHunk.additionStart = realHunk.additionStart;
  alignedHunk.hunkSpecs = realHunk.hunkSpecs;
  return withContext;
}

export function lineInHunks(hunks: Hunk[], side: "LEFT" | "RIGHT", line: number): boolean {
  return hunks.some((hunk) => {
    const range = hunkRange(hunk);
    return side === "RIGHT"
      ? line >= range.newStart && line <= range.newEnd
      : line >= range.oldStart && line <= range.oldEnd;
  });
}

/** Changes the reading path can't show: files without a patch, and files GitHub's listing left out. */
export function filesNotShown(pr: PrDetails): { files: PrFile[]; unlisted: number } {
  return { files: pr.files.filter((file) => file.hunkIds.length === 0), unlisted: Math.max(0, pr.changedFiles - pr.files.length) };
}

/** Groups from the analysis, or one group per file while it is not ready. */
export function displayGroups(data: ReviewGet): ReviewGroup[] {
  const result = data.completed?.result;
  if (result && data.completed?.headSha === data.pr.headSha) return result.groups;
  const analysed = data.completed?.hunkFingerprints;
  if (result && analysed) {
    // Older analysis: hunk ids are positions, so a new commit can move them. Find each group's hunks by content.
    const unclaimed = new Map<string, string[]>();
    for (const hunk of data.pr.hunks) unclaimed.set(hunk.fingerprint, [...(unclaimed.get(hunk.fingerprint) ?? []), hunk.id]);
    const groups = result.groups
      .map((group) => ({ ...group, hunkIds: group.hunkIds.flatMap((id) => unclaimed.get(analysed[id] ?? "")?.shift() ?? []) }))
      .filter((group) => group.hunkIds.length > 0);
    const covered = new Set(groups.flatMap((group) => group.hunkIds));
    const rest = data.pr.hunks.filter((hunk) => !covered.has(hunk.id)).map((hunk) => hunk.id);
    if (rest.length > 0) {
      groups.push({ id: "__new", title: "Changed since the analysis", why: "Hunks the last analysis did not see.", kind: "core", hunkIds: rest });
    }
    return groups;
  }
  return data.pr.files
    .filter((file) => file.hunkIds.length > 0)
    .map((file) => ({
      id: `file-${file.index}`,
      title: file.path,
      why: result ? "This analysis is too old to match to the new commits. Re-analyse to group them." : "Analysis not ready yet; showing the diff by file.",
      kind: "core" as const,
      hunkIds: file.hunkIds,
    }));
}

/** A pending comment shows on its line only if it was written on this commit and the line is still in the diff. */
export function draftInDiff(comment: PendingComment, headSha: string, hunks: Hunk[]): boolean {
  return comment.headSha === headSha && lineInHunks(hunks, comment.side, comment.line);
}

/** A comment from another commit can move to this one only if its whole line range is in the diff. */
export function canKeepDraft(comment: PendingComment, headSha: string, hunks: Hunk[]): boolean {
  if (comment.headSha === headSha || !lineInHunks(hunks, comment.side, comment.line)) return false;
  return comment.startLine === null || lineInHunks(hunks, comment.startSide ?? comment.side, comment.startLine);
}

export function threadVisibleIn(thread: ReviewThread, path: string, hunks: Hunk[]): boolean {
  return thread.path === path && thread.line !== null && lineInHunks(hunks, thread.side, thread.line);
}

/** One side's text for lines start..end: seeds suggestion blocks and chat questions. */
export function sideLines(hunks: Hunk[], side: "LEFT" | "RIGHT", start: number, end: number): string[] | null {
  // Lines that only exist on the other side.
  const other = side === "RIGHT" ? "-" : "+";
  const lines = new Map<number, string>();
  for (const hunk of hunks) {
    const range = hunkRange(hunk);
    let lineNumber = side === "RIGHT" ? range.newStart : range.oldStart;
    for (const raw of hunk.patch.split("\n").slice(1)) {
      if (raw.startsWith(other) || raw.startsWith("\\")) continue;
      lines.set(lineNumber, raw.slice(1));
      lineNumber += 1;
    }
  }
  const out: string[] = [];
  for (let line = start; line <= end; line += 1) {
    const text = lines.get(line);
    if (text === undefined) return null;
    out.push(text);
  }
  return out;
}

/** First changed line of a hunk, for keyboard commenting. */
export function firstChangedLine(hunk: Hunk): { side: "LEFT" | "RIGHT"; line: number } {
  const range = hunkRange(hunk);
  let oldLine = range.oldStart;
  let newLine = range.newStart;
  for (const raw of hunk.patch.split("\n").slice(1)) {
    if (raw.startsWith("+")) return { side: "RIGHT", line: newLine };
    if (raw.startsWith("-")) return { side: "LEFT", line: oldLine };
    oldLine += 1;
    newLine += 1;
  }
  return { side: "RIGHT", line: range.newStart };
}
