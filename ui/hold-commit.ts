// New commits don't replace the code the user is reading until they ask, like GitHub's refresh prompt.
import type { ReviewGet } from "../shared/contract";

/** The latest review, keeping the shown commit's code. Everything else, like new comments, stays live. */
export function holdShownCommit(shown: ReviewGet | null, latest: ReviewGet): ReviewGet {
  if (shown === null || shown.pr.headSha === latest.pr.headSha) return latest;
  const { headSha, changedFiles, files, hunks, threads } = shown.pr;
  const shownThreads = new Map(threads.map((thread) => [thread.id, thread]));
  return {
    ...latest,
    changedSinceViewed: shown.changedSinceViewed,
    pr: {
      ...latest.pr,
      headSha,
      changedFiles,
      files,
      hunks,
      threads: latest.pr.threads.map((thread) => {
        // GitHub moves a comment's line with the new commit, which would misplace it in the shown code.
        const held = shownThreads.get(thread.id);
        return held ? { ...thread, line: held.line, startLine: held.startLine, isOutdated: held.isOutdated } : thread;
      }),
    },
  };
}

/** What to store for marked hunks. The server can't work this out: it only knows the PR's latest commit. */
export function viewedRows(pr: ReviewGet["pr"], fingerprints: string[]) {
  const paths = new Map(pr.files.map((file) => [file.index, file.path]));
  const wanted = new Set(fingerprints);
  return {
    hunks: pr.hunks.filter((hunk) => wanted.has(hunk.fingerprint)).map((hunk) => ({ path: paths.get(hunk.fileIndex)!, fingerprint: hunk.fingerprint })),
    current: pr.hunks.map((hunk) => hunk.fingerprint),
  };
}
