// The Code panel: the hunks behind what Explain points at, with the Diff tab's
// line comments and ask-in-chat.
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { CodeFile } from "./code-panel";
import { byGithubId, HunkDiff, type DraftTarget } from "./DiffTab";
import type { ReviewGet, Rpc } from "./useReview";

/** What the panel shows: a title and its code, or null when nothing is picked. */
export type CodeSubject = { title: string; detail?: string; code: CodeFile[] } | null;

export function CodePanel({
  data,
  rpc,
  subject,
  onAskChat,
  onOpenFile,
  onCollapse,
}: {
  data: ReviewGet;
  rpc: Rpc;
  subject: CodeSubject;
  onAskChat: (question: string) => Promise<void>;
  onOpenFile: (path: string) => void;
  onCollapse: () => void;
}) {
  const storedByGithubId = useMemo(() => byGithubId(data.comments), [data.comments]);
  const [draft, setDraft] = useState<DraftTarget | null>(null);
  return (
    <>
      <div className="flex items-start gap-2 border-b border-border p-3">
        <div className="min-w-0 flex-1">
          {subject?.detail ? <div className="text-[11px] uppercase text-muted-foreground">{subject.detail}</div> : null}
          <div className="truncate text-sm font-medium">{subject?.title ?? "Code"}</div>
        </div>
        <Button size="icon" variant="ghost" className="size-7" onClick={onCollapse} aria-label="Collapse code panel">
          <Icon name="ChevronRight" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {subject === null ? <p className="p-3 text-sm text-muted-foreground">Pick a step or a part of the diagram to see its code.</p> : null}
        {subject?.code.length === 0 ? <p className="p-3 text-sm text-muted-foreground">No changed lines here.</p> : null}
        {subject?.code.map(({ file, hunks }) => (
          <section key={file.path} className="border-b border-border last:border-b-0">
            <button
              type="button"
              onClick={() => onOpenFile(file.path)}
              className="sticky top-0 z-10 flex w-full items-center gap-1.5 border-b border-border bg-background px-3 py-1.5 text-left text-xs hover:underline"
              title="Open in Diff"
            >
              <Icon name="FileDiff" className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{file.path}</span>
              <Icon name="ArrowUpRight" className="ml-auto size-3 shrink-0 text-muted-foreground" />
            </button>
            {hunks.map((hunk) => (
              <HunkDiff
                key={hunk.id}
                hunk={hunk}
                file={file}
                data={data}
                rpc={rpc}
                view="unified"
                draft={draft?.hunkId === hunk.id ? draft : null}
                setDraft={setDraft}
                active={false}
                onActivate={() => {}}
                storedByGithubId={storedByGithubId}
                onAskChat={onAskChat}
              />
            ))}
          </section>
        ))}
      </div>
    </>
  );
}
