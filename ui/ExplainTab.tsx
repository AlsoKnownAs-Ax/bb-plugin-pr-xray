// The visual explanation: PR Lens diagrams on a full-bleed canvas, with the
// explanation floating on the left and the Code panel on the right.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { experimental_useCodeTheme as useCodeTheme } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { useIsCompactViewport } from "@/components/ui/hooks/use-compact-viewport";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { diagramTabs } from "../shared/diagram-tabs";
import type { AnalysisRecord, ReviewGroup } from "../shared/schema";
import { panelLayout } from "./canvas-view";
import { codeSubject, hunksCode, refsCode, type CodeSubject } from "./code-panel";
import { CodePanel } from "./CodePanel";
import { DiagramCanvas } from "./DiagramCanvas";
import { overlayTargets, type OverlayTarget } from "./diagram-overlay";
import { SafeMarkdown } from "./SafeMarkdown";
import type { ReviewGet, Rpc } from "./useReview";
import { citeTarget, focusBoxes, nodeTab, stepTarget, type Focus, type Target } from "./walkthrough";
import { useStepKeys, WalkthroughProgress, WalkthroughSteps } from "./WalkthroughPanel";
import type { CiteRef, GraphDoc } from "@coldtea/pr-lens-schema";

const SEVERITY_STYLE = {
  high: "border-destructive/60 text-destructive",
  medium: "border-warning/60 text-warning-text",
  low: "border-border text-muted-foreground",
} as const;

type Result = NonNullable<AnalysisRecord["result"]>;

type ExplainTabProps = {
  data: ReviewGet;
  analysis: AnalysisRecord;
  rpc: Rpc;
  groups: ReviewGroup[];
  onOpenGroup: (groupId: string) => void;
  onOpenFile: (path: string) => void;
  onAskChat: (question: string) => Promise<void>;
  onReanalyse: () => void;
};

export function ExplainTab(props: ExplainTabProps) {
  const result = props.analysis.result!;
  const { graph, renders } = result;
  if (graph && renders) {
    return <DiagramExplain {...props} graph={graph} renders={renders} />;
  }

  // A legacy analysis: its summary and look-closely still hold; only the diagrams need a re-run.
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-6">
        <h2 className="text-base font-semibold">What this PR does</h2>
        <Summary result={result} />
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border p-6 text-sm text-muted-foreground">
          Re-run analysis to see the new diagrams.
          <Button size="sm" variant="outline" onClick={props.onReanalyse}>
            <Icon name="Sparkles" />
            Re-run analysis
          </Button>
        </div>
        {result.lookClosely.length > 0 ? <h2 className="text-base font-semibold">Where to look closely</h2> : null}
        <LookClosely result={result} groups={props.groups} onOpenGroup={props.onOpenGroup} />
      </div>
    </div>
  );
}

function DiagramExplain({
  data,
  analysis,
  rpc,
  groups,
  onOpenFile,
  onAskChat,
  graph,
  renders,
}: ExplainTabProps & { graph: GraphDoc; renders: NonNullable<Result["renders"]> }) {
  const theme = useCodeTheme().mode;
  const compact = useIsCompactViewport();
  const tabs = useMemo(() => diagramTabs(graph), [graph]);
  const [tabId, setTabId] = useState(tabs[0]!.id);
  const tab = tabs.find((candidate) => candidate.id === tabId) ?? tabs[0]!;
  const render = renders[tab.id]?.[theme];
  const targets = render ? overlayTargets(graph, tab, render.atlas) : [];
  // A node or table on the current tab, by id.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = targets.find((target) => target.id === selectedId);
  const steps = graph.walkthrough?.steps ?? [];
  const [step, setStep] = useState<number | null>(null);
  const [focus, setFocus] = useState<Focus>({ kind: "all" });
  // A cited file or a look-closely group, shown until the next step or part is picked.
  const [pinned, setPinned] = useState<CodeSubject>(null);
  const [explainOpen, setExplainOpen] = useStoredFlag("pr-xray:explain-panel", true);
  const [codeOpen, setCodeOpen] = useStoredFlag("pr-xray:code-panel", true);
  // A compact viewport has room for one panel: opening one closes the other.
  const openExplain = (open: boolean) => {
    setExplainOpen(open);
    if (open && compact) setCodeOpen(false);
  };
  const openCode = (open: boolean) => {
    setCodeOpen(open);
    if (open && compact) setExplainOpen(false);
  };
  const { showExplain, reserve } = panelLayout(compact, explainOpen, codeOpen);
  const focused = render ? focusBoxes(focus, render.atlas, tab.flow) : [];

  const show = (target: Target) => {
    if (target.tab && target.tab !== tab.id) {
      setSelectedId(null);
      setTabId(target.tab);
    }
    setFocus(target.focus);
  };
  const selectStep = (index: number | null) => {
    setStep(index);
    setPinned(null);
    const chosen = index === null ? undefined : steps[index];
    if (chosen) show(stepTarget(chosen));
    else setFocus({ kind: "all" });
  };
  const selectPart = (id: string | null) => {
    setSelectedId(id);
    setPinned(null);
  };
  const pin = (subject: NonNullable<CodeSubject>) => {
    setSelectedId(null);
    setPinned(subject);
    openCode(true);
  };
  const citeAction = (ref: CiteRef) => {
    if (ref.kind === "file") return () => pin({ title: ref.path, detail: "file", code: refsCode(data.pr, [{ path: ref.path }]) });
    // Node and table cites select the part; column cites stay plain text.
    if (ref.kind === "node" || ref.kind === "table") {
      const id = partId(ref);
      const onTab = nodeTab(graph, tabs, tab.id, id);
      if (!onTab) {
        return null;
      }

      return () => {
        // The step and its zoom belong to their own tab; leave them when switching away.
        if (onTab !== tab.id) {
          setStep(null);
          setFocus({ kind: "all" });
          setTabId(onTab);
        }
        selectPart(id);
      };
    }
    const target = citeTarget(graph, tabs, ref);
    return target ? () => show(target) : null;
  };
  const openGroup = (group: ReviewGroup) => pin({ title: group.title, detail: "group", code: hunksCode(data.pr, group.hunkIds) });

  useStepKeys({ steps, current: step, onSelect: selectStep });
  const hasSteps = steps.length > 0;
  const subject = codeSubject({ doc: graph, pr: data.pr, tabs, tab, selected, pinned, step });

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      {render ? (
        <DiagramCanvas
          key={tab.id}
          render={render}
          onBackgroundClick={() => {
            selectPart(null);
            selectStep(null);
          }}
          overlay={() => <DiagramOverlay targets={targets} selectedId={selectedId} onSelect={selectPart} />}
          focus={focused}
          reserve={reserve}
        />
      ) : null}

      {/* The lens tabs, centred in the space the panels leave. */}
      <div className="pointer-events-none absolute top-3 flex justify-center px-3" style={{ left: reserve.left, right: reserve.right }}>
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-md">
          {tabs.map((candidate) => (
            <Button
              key={candidate.id}
              size="sm"
              variant="ghost"
              aria-pressed={candidate.id === tab.id}
              onClick={() => {
                setTabId(candidate.id);
                selectPart(null);
                selectStep(null);
              }}
            >
              {candidate.title}
            </Button>
          ))}
          <span className="hidden px-2 text-xs text-muted-foreground lg:inline">
            Drag to pan · scroll to zoom
            {hasSteps ? " · ← → to step" : null}
          </span>
        </div>
      </div>

      {showExplain ? (
        <FloatingPanel side="left" compact={compact} label="Explanation">
          <div className="flex items-center gap-2 border-b border-border p-3">
            <span className="flex-1 text-sm font-medium">Explanation</span>
            <Button size="icon" variant="ghost" className="size-7" onClick={() => openExplain(false)} aria-label="Collapse explanation">
              <Icon name="ChevronLeft" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
            <Section title="What this PR does">
              <Summary result={analysis.result!} />
            </Section>
            {hasSteps ? (
              <Section title="Walkthrough" aside={<WalkthroughProgress steps={steps} current={step} onSelect={selectStep} />}>
                <WalkthroughSteps steps={steps} current={step} onSelect={selectStep} citeAction={citeAction} />
              </Section>
            ) : null}
            {analysis.result!.lookClosely.length > 0 ? (
              <Section title="Where to look closely">
                <LookClosely result={analysis.result!} groups={groups} onOpenGroup={(id) => {
                  const group = groups.find((candidate) => candidate.id === id);
                  if (group) openGroup(group);
                }} />
              </Section>
            ) : null}
          </div>
        </FloatingPanel>
      ) : (
        <Button size="sm" variant="outline" className="absolute left-3 top-3 bg-background shadow-md" onClick={() => openExplain(true)}>
          <Icon name="BookOpen" />
          Explanation
        </Button>
      )}

      {codeOpen ? (
        <FloatingPanel side="right" compact={compact} label="Code panel">
          <CodePanel data={data} rpc={rpc} subject={subject} onAskChat={onAskChat} onOpenFile={onOpenFile} onCollapse={() => openCode(false)} />
        </FloatingPanel>
      ) : (
        <Button size="sm" variant="outline" className="absolute right-3 top-3 bg-background shadow-md" onClick={() => openCode(true)}>
          <Icon name="Code" />
          Code
        </Button>
      )}
    </div>
  );
}

/** A panel floating over one edge of the canvas; across the whole width on a compact viewport. The right one stops above the chat button. */
function FloatingPanel({ side, compact, label, children }: { side: "left" | "right"; compact: boolean; label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className={cn(
        "absolute top-3 flex flex-col overflow-hidden rounded-lg border border-border bg-background shadow-md motion-safe:animate-in motion-safe:fade-in-0",
        side === "left" ? "max-h-[calc(100%-1.5rem)] motion-safe:slide-in-from-left-2" : "max-h-[calc(100%-5.5rem)] motion-safe:slide-in-from-right-2",
        compact ? "inset-x-3" : side === "left" ? "left-3 w-80" : "right-3 w-[30rem]",
      )}
    >
      {children}
    </aside>
  );
}

/** A collapsible part of the explanation panel. */
function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <details open className="group">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold hover:bg-state-hover">
        <Icon name="ChevronRight" className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        {title}
        {aside ? (
          // Clicks on the progress and its button must not toggle the section.
          <span className="ml-auto flex items-center gap-2" onClick={(event) => event.preventDefault()}>
            {aside}
          </span>
        ) : null}
      </summary>
      <div className="px-3 pb-3">{children}</div>
    </details>
  );
}

/** A boolean kept in localStorage, so the choice holds across reviews. */
function useStoredFlag(key: string, initial: boolean) {
  const [value, setValue] = useState(() => (localStorage.getItem(key) ?? String(initial)) === "true");
  useEffect(() => localStorage.setItem(key, String(value)), [key, value]);
  return [value, setValue] as const;
}

function Summary({ result }: { result: Result }) {
  return (
    <section className="space-y-2">
      <SafeMarkdown content={result.summary} />
      {result.ticket.url ? (
        <p className="text-xs text-muted-foreground">
          Ticket:{" "}
          <a className="underline" href={result.ticket.url} target="_blank" rel="noreferrer">
            {result.ticket.title ?? result.ticket.url}
          </a>
          {result.ticket.projectTitle ? ` · Project: ${result.ticket.projectTitle}` : ""}
        </p>
      ) : null}
    </section>
  );
}

/** The look-closely items, each linking to the groups it names. */
function LookClosely({ result, groups, onOpenGroup }: { result: Result; groups: ReviewGroup[]; onOpenGroup: (groupId: string) => void }) {
  const groupTitles = useMemo(() => new Map(groups.map((group) => [group.id, group.title])), [groups]);
  if (result.lookClosely.length === 0) {
    return null;
  }

  return (
    <ul className="space-y-2">
      {result.lookClosely.map((item, index) => (
        <li key={index} className={cn("rounded-lg border bg-card px-3 py-2", SEVERITY_STYLE[item.severity])}>
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            {item.title}
            <span className="text-[11px] font-normal uppercase">{item.severity}</span>
          </div>
          <SafeMarkdown content={item.reason} className="text-sm text-muted-foreground" />
          {item.groupIds.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {item.groupIds
                .filter((id) => groupTitles.has(id))
                .map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onOpenGroup(id)}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-state-hover hover:text-foreground"
                  >
                    <Icon name="FileDiff" className="size-3" />
                    {groupTitles.get(id)}
                  </button>
                ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** The node or table a cite names. */
function partId(ref: Extract<CiteRef, { kind: "node" | "table" }>): string {
  if (ref.kind === "node") {
    return ref.node;
  }

  return ref.table;
}

/** Click targets over the SVG, in its viewBox units, so they stay on their card at any zoom. */
function DiagramOverlay({ targets, selectedId, onSelect }: { targets: OverlayTarget[]; selectedId: string | null; onSelect: (id: string) => void }) {
  return targets.map((target) => (
    <button
      key={target.id}
      type="button"
      aria-label={`${target.label}: show code`}
      aria-pressed={target.id === selectedId}
      // No ring on hover or selection, as in PR Lens: the Code panel shows what's selected. Keyboard focus keeps one.
      className="absolute cursor-pointer rounded-lg outline-primary focus-visible:outline-2"
      // 12px out: clears the delta badge, which rises 8px above the card (renderer BADGE_RISE).
      style={{ left: target.box.x, top: target.box.y, width: target.box.width, height: target.box.height, outlineOffset: 12 }}
      onClick={() => onSelect(target.id)}
    />
  ));
}
