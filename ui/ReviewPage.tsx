// One PR's review: header, analysis status, Diff/Explain tabs, focus mode.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { usePortalScopeProps } from "@/lib/portal-scope";
import { cn } from "@/lib/utils";
import type { PrRef } from "../shared/schema";
import { AgentConfirmProvider, useAgentConfirm } from "./agent-confirm";
import { AgentDeclined } from "./agent-trust";
import { ChatBubble } from "./ChatBubble";
import { DiffTab, type ViewMode } from "./DiffTab";
import { displayGroups } from "./diff-utils";
import { viewedRows } from "./hold-commit";
import { ExplainTab } from "./ExplainTab";
import { ReportBugButton } from "./ReportBug";
import { uiStore } from "./store";
import { errorMessage, useReview } from "./useReview";

type Tab = "diff" | "explain";

const PAGE_FRAME_CLASS = "relative flex h-full min-h-0 flex-1 flex-col";

function FocusFrame({ focus, children }: { focus: boolean; children: ReactNode }) {
  const scope = usePortalScopeProps();
  const slot = useRef<HTMLDivElement>(null);
  // One element that moves between the page and document.body. React sees the same tree
  // either way, so toggling focus keeps state such as a half-written comment.
  const [frame] = useState(() => {
    const element = document.createElement("div");
    element.style.display = "contents";
    return element;
  });
  useLayoutEffect(() => {
    // Moving a node resets its scroll position and focus, so put them back.
    const active = document.activeElement;
    const scrolled = Array.from(frame.querySelectorAll("*")).filter((element) => element.scrollTop > 0).map((element) => [element, element.scrollTop] as const);
    (focus ? document.body : slot.current)?.append(frame);
    for (const [element, top] of scrolled) element.scrollTop = top;
    if (active instanceof HTMLElement && frame.contains(active)) active.focus();
  }, [focus, frame]);
  useLayoutEffect(() => () => frame.remove(), [frame]);
  return (
    <div ref={slot} className={PAGE_FRAME_CLASS}>
      {createPortal(
        // One layer below bb's toaster (z-index 49), so toasts stay visible in focus mode.
        <div {...scope} className={focus ? "fixed inset-0 z-[48] flex flex-col bg-background text-foreground" : PAGE_FRAME_CLASS}>
          {children}
        </div>,
        frame,
      )}
    </div>
  );
}

export function ReviewPage({ prRef }: { prRef: PrRef }) {
  const { rpc, data, error, refetch, refresh, newCommits } = useReview(prRef);
  const navigate = useBbNavigate();
  const [tab, setTab] = useState<Tab>("diff");
  const [focus, setFocus] = useState(() => uiStore.get().focusOnOpen);
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem("pr-xray:view") as ViewMode) ?? "unified");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [scrollRequest, setScrollRequest] = useState<{ groupId: string; nonce: number } | null>(null);
  const [fileRequest, setFileRequest] = useState<string | null>(null);
  const [localViewed, setLocalViewed] = useState<Map<string, boolean>>(new Map());
  const [chatRequest, setChatRequest] = useState<{ threadId: string; nonce: number } | null>(null);
  const [editingTicket, setEditingTicket] = useState(false);

  useEffect(() => {
    if (uiStore.get().focusOnOpen) uiStore.set({ focusOnOpen: false });
  }, []);
  useEffect(() => localStorage.setItem("pr-xray:view", view), [view]);
  useEffect(() => setLocalViewed(new Map()), [data?.viewedHunks]);

  // f toggles focus mode, Esc leaves it, 1/2 switch tabs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // A key the walkthrough already took (Esc on a step) is not for focus mode.
      if (event.defaultPrevented) return;
      if (target?.closest("input, textarea, [contenteditable=true], [role=dialog]") || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "f") setFocus((value) => !value);
      else if (event.key === "Escape" && focus) setFocus(false);
      else if (event.key === "1") setTab("diff");
      else if (event.key === "2") setTab("explain");
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  const groups = useMemo(() => (data ? displayGroups(data) : []), [data]);
  const analysis = data?.completed ?? null;
  /** Fingerprints of viewed hunks, with optimistic local toggles applied. */
  const viewedHunks = useMemo(() => {
    const set = new Set(data?.viewedHunks ?? []);
    for (const [fingerprint, value] of localViewed) {
      if (value) set.add(fingerprint);
      else set.delete(fingerprint);
    }
    return set;
  }, [data?.viewedHunks, localViewed]);

  const shownPr = data?.pr;
  const setHunksViewed = useCallback(
    (fingerprints: string[], value: boolean) => {
      if (!shownPr) return;
      setLocalViewed((current) => {
        const next = new Map(current);
        for (const fingerprint of fingerprints) next.set(fingerprint, value);
        return next;
      });
      rpc.call("hunks.setViewed", { ref: prRef, ...viewedRows(shownPr, fingerprints), viewed: value }).catch((cause: unknown) => {
        // Fall back to the saved state so the checkbox doesn't claim a save that failed.
        setLocalViewed((current) => {
          const next = new Map(current);
          for (const fingerprint of fingerprints) next.delete(fingerprint);
          return next;
        });
        toast.error(errorMessage(cause));
      });
    },
    [prRef, rpc, shownPr],
  );

  const { confirmAgent, confirmOthersComments, dialog: agentDialog } = useAgentConfirm(prRef, data?.pr ?? null);
  const agentConfirm = useMemo(() => ({ confirmAgent, confirmOthersComments }), [confirmAgent, confirmOthersComments]);

  const askChat = useCallback(
    async (question: string) => {
      // Throwing keeps the question in its text box.
      if (!(await confirmAgent("chat"))) throw new AgentDeclined();
      const { threadId } = await rpc.call("chat.start", { ref: prRef, question });
      setChatRequest({ threadId, nonce: Date.now() });
    },
    [confirmAgent, prRef, rpc],
  );

  const reanalyse = async () => {
    if (!(await confirmAgent("analysis"))) return;
    try {
      await rpc.call("analysis.start", { ref: prRef });
      // The analysis is of the latest commit, so show that.
      await refresh();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  };

  if (error && !data) {
    return (
      <div className="p-6">
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <Icon name="AlertTriangle" className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
        <Button className="mt-3" size="sm" variant="outline" onClick={refetch}>
          Retry
        </Button>
      </div>
    );
  }
  if (!data) {
    return (
      // The real header's shape, so the title lands where the placeholder was.
      <div role="status" className="flex h-full min-h-0 flex-col">
        {/* py-2 plus the xs (16px) and base (24px) line boxes: the real header's 56px. */}
        <div className="border-b border-border px-4 py-2 motion-safe:animate-pulse">
          <div className="my-0.5 h-3 w-56 max-w-full rounded-sm bg-muted" />
          <div className="my-1 h-4 w-96 max-w-full rounded-sm bg-muted" />
        </div>
        <div className="flex flex-1 items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <Icon name="Spinner" className="size-4 animate-spin" />
          Loading pull request…
        </div>
      </div>
    );
  }

  const { pr, current } = data;
  const running = current?.status === "running";
  const failed = current?.status === "failed";
  const stale = analysis !== null && analysis.headSha !== pr.headSha;

  return (
    <FocusFrame focus={focus}>
      <AgentConfirmProvider value={agentConfirm}>
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <div className="min-w-64 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <a href={pr.url} target="_blank" rel="noreferrer" className="hover:underline">
              {pr.ref.owner}/{pr.ref.repo}#{pr.ref.number}
            </a>
            <span>·</span>
            <span className="font-mono">
              {pr.headRef} → {pr.baseRef}
            </span>
            <span>·</span>
            <span>{pr.draft ? "draft" : pr.state}</span>
            {analysis?.diffOnly ? <span className="whitespace-nowrap rounded border border-border px-1.5">diff-only analysis</span> : null}
            {data.ticketUrl !== null && !editingTicket ? (
              <>
                <span>·</span>
                <span className="flex min-w-0 items-center gap-1">
                  <Icon name="Link" className="size-3 shrink-0" />
                  <a href={data.ticketUrl} target="_blank" rel="noreferrer" className="max-w-xs truncate hover:underline" title={data.ticketUrl}>
                    {data.ticketOverridden ? "Ticket (set by you)" : "Ticket"}
                  </a>
                  <button type="button" className="hover:text-foreground hover:underline" onClick={() => setEditingTicket(true)}>
                    Change
                  </button>
                </span>
              </>
            ) : null}
          </div>
          <h1 className="truncate text-base font-semibold">{pr.title}</h1>
        </div>
        {/* Left of the tabs, so the flex-1 title absorbs its width on Explain and the tabs don't shift. */}
        {tab === "diff" ? (
          <Button size="sm" variant="ghost" onClick={() => setView(view === "unified" ? "split" : "unified")} aria-label="Toggle split view">
            <Icon name={view === "unified" ? "Columns2" : "Rows2"} />
            {view === "unified" ? "Split" : "Unified"}
          </Button>
        ) : null}
        <div role="tablist" aria-label="Review view" className="flex items-center gap-1 rounded-md border border-border p-0.5">
          {(["diff", "explain"] as const).map((value, index) => (
            <Button
              key={value}
              role="tab"
              size="sm"
              variant="ghost"
              aria-selected={tab === value}
              aria-keyshortcuts={String(index + 1)}
              className="aria-selected:bg-state-active aria-selected:text-foreground"
              onClick={() => setTab(value)}
            >
              <Icon name={value === "diff" ? "FileDiff" : "Workflow"} />
              {value === "diff" ? "Diff" : "Explain"}
            </Button>
          ))}
        </div>
        {current || analysis ? (
          <Button size="sm" variant="ghost" onClick={() => void reanalyse()} disabled={running} aria-label="Run the analysis again">
            <Icon name="RotateCcw" className={cn(running && "animate-spin")} />
            {running ? "Analysing…" : "Re-analyse"}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => void reanalyse()} aria-label="Analyse this PR">
            <Icon name="Sparkles" />
            Analyse
          </Button>
        )}
        {analysis?.workerThreadId ? (
          <Button size="sm" variant="ghost" onClick={() => navigate.toThread(analysis.workerThreadId!)} aria-label="Open the agent run behind this analysis">
            <Icon name="Bot" />
            Agent run
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={() => setFocus(!focus)} aria-keyshortcuts={focus ? "f Escape" : "f"}>
          <Icon name={focus ? "Minimize2" : "Maximize2"} />
          {focus ? "Exit focus" : "Focus"}
        </Button>
        <ReportBugButton />
      </header>

      {running && current ? (
        <AnalysisProgress
          startedAt={current.createdAt}
          hasAnalysis={analysis !== null}
          onOpenRun={current.workerThreadId ? () => navigate.toThread(current.workerThreadId!) : null}
        />
      ) : null}
      <Banners
        newCommits={newCommits ? pr.headSha.slice(0, 7) : null}
        onRefresh={() => void refresh().catch((cause: unknown) => toast.error(errorMessage(cause)))}
        failed={failed ? (current?.error ?? "Analysis failed.") : null}
        stale={stale && !running}
        onReanalyse={() => void reanalyse()}
        ticketUrl={data.ticketUrl}
        editingTicket={editingTicket}
        onEditingTicketChange={setEditingTicket}
        onSetTicket={async (url) => {
          await rpc.call("review.setTicket", { ref: prRef, url });
          refetch();
        }}
      />

      <div className="min-h-0 flex-1">
        {tab === "diff" ? (
          <DiffTab
            data={data}
            rpc={rpc}
            view={view}
            groups={groups}
            viewedHunks={viewedHunks}
            onSetViewed={setHunksViewed}
            onAskChat={askChat}
            activeGroupId={activeGroupId}
            onActiveGroupChange={setActiveGroupId}
            scrollRequest={scrollRequest}
            fileRequest={fileRequest}
            onFileRequestHandled={() => setFileRequest(null)}
          />
        ) : analysis?.result ? (
          <ExplainTab
            key={analysis.id}
            data={data}
            analysis={analysis}
            rpc={rpc}
            groups={groups}
            onOpenGroup={(groupId) => {
              setTab("diff");
              setScrollRequest({ groupId, nonce: Date.now() });
            }}
            onOpenFile={(path) => {
              setTab("diff");
              setFileRequest(path);
            }}
            onReanalyse={() => void reanalyse()}
          />
        ) : running ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-sm text-muted-foreground">
            <Icon name="Spinner" className="size-6 animate-spin" />
            The explanation appears here when the analysis finishes.
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3 p-6 text-sm text-muted-foreground">
            {analysis?.legacy
              ? "Re-run analysis to see the new diagrams."
              : "No analysis yet. Analyse the PR to get a summary, walkthrough and diagrams."}
            <Button size="sm" variant="outline" onClick={() => void reanalyse()}>
              <Icon name="Sparkles" />
              {analysis?.legacy ? "Re-run analysis" : "Analyse"}
            </Button>
          </div>
        )}
      </div>
      <ChatBubble rpc={rpc} prRef={prRef} onAsk={askChat} openRequest={chatRequest} />
      {agentDialog}
      </AgentConfirmProvider>
    </FocusFrame>
  );
}

/** Typical run time; the bar eases towards full around here, never reaching it. */
const EXPECTED_MS = 60_000;

function AnalysisProgress({
  startedAt,
  hasAnalysis,
  onOpenRun,
}: {
  startedAt: string;
  hasAnalysis: boolean;
  onOpenRun: (() => void) | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const elapsed = Math.max(0, now - Date.parse(startedAt));
  const seconds = Math.floor(elapsed / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const progress = 1 - Math.exp(-elapsed / (EXPECTED_MS / 2));
  const slow = elapsed > EXPECTED_MS * 3;
  return (
    <div role="status" aria-live="polite" className="border-b border-border bg-muted/40">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2 text-xs">
        <Icon name="Spinner" className="size-4 animate-spin text-foreground" />
        <span className="font-medium text-foreground">Analysing the PR</span>
        <span className="text-muted-foreground">· reading the diff and ticket, grouping hunks, drawing diagrams</span>
        <span className="font-mono tabular-nums text-muted-foreground">{clock}</span>
        <span className="text-muted-foreground">
          {slow
            ? "Taking longer than usual. Open the run to see what the agent is doing."
            : hasAnalysis
              ? "Showing the previous analysis meanwhile."
              : "Showing the diff by file meanwhile."}
        </span>
        {onOpenRun ? (
          <Button size="sm" variant="ghost" className="ml-auto h-6 px-2 text-xs" onClick={onOpenRun}>
            <Icon name="Bot" />
            Watch the agent
          </Button>
        ) : null}
      </div>
      <div className="h-0.5 overflow-hidden bg-muted">
        <div
          className="h-full origin-left bg-primary transition-transform duration-1000 ease-linear motion-reduce:transition-none"
          style={{ transform: `scaleX(${(progress * 0.95).toFixed(3)})` }}
        />
      </div>
    </div>
  );
}

function Banners({
  newCommits,
  onRefresh,
  failed,
  stale,
  onReanalyse,
  ticketUrl,
  editingTicket: editing,
  onEditingTicketChange: setEditing,
  onSetTicket,
}: {
  /** The short commit still being shown, when the PR has moved past it. */
  newCommits: string | null;
  onRefresh: () => void;
  failed: string | null;
  stale: boolean;
  onReanalyse: () => void;
  ticketUrl: string | null;
  /** A linked ticket shows in the header; this row appears only to add or change it. */
  editingTicket: boolean;
  onEditingTicketChange: (editing: boolean) => void;
  onSetTicket: (url: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(ticketUrl ?? "");
  const banner = "flex flex-wrap items-center gap-2 border-b border-border px-4 py-1.5 text-xs";
  return (
    <>
      {newCommits ? (
        <div role="status" className={cn(banner, "bg-warning/10")}>
          <Icon name="Commit" className="size-3.5" />
          New commits were pushed. You're still viewing {newCommits}.
          <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={onRefresh}>
            <Icon name="RotateCcw" className="size-3" />
            Refresh
          </Button>
        </div>
      ) : null}
      {failed || stale ? (
        // One analysis-status row: a failure outranks a stale result.
        <div role={failed ? "alert" : "status"} className={cn(banner, failed ? "text-destructive" : "bg-muted/40")}>
          <Icon name={failed ? "AlertTriangle" : "Commit"} className="size-3.5" />
          {failed ?? "New commits since the last analysis."}
          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onReanalyse}>
            {failed ? "Try again" : "Re-analyse"}
          </Button>
        </div>
      ) : null}
      {ticketUrl === null || editing ? (
        <div className={cn(banner, "text-muted-foreground")}>
          <Icon name="Link" className="size-3.5" />
          {editing ? "Ticket link:" : "No ticket linked. The analysis will rely on the PR description."}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const url = value.trim();
              void onSetTicket(url === "" ? null : url)
                .then(() => setEditing(false))
                .catch((error: unknown) => toast.error(errorMessage(error)));
            }}
          >
            <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://www.notion.so/…" className="h-7 w-80 text-xs" />
            <Button size="sm" variant="outline" className="h-7 text-xs" type="submit">
              Save
            </Button>
            {editing ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs" type="button" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            ) : null}
          </form>
          <span>Re-analyse to use it.</span>
        </div>
      ) : null}
    </>
  );
}
