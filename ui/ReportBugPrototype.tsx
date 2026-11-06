// PROTOTYPE (throwaway, branch prototype/report-a-bug): three variants of the
// "Report a bug" entry points, on the existing review page header and Settings
// section. Switch with the floating bar or ←/→. Not for main.
import { type ReactNode, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const VARIANTS = [
  { key: "A", name: "Labelled button + footer link" },
  { key: "B", name: "Icon-only button + Support block" },
  { key: "C", name: "Button with preview + version footer" },
] as const;
type VariantKey = (typeof VARIANTS)[number]["key"];

// In memory: bb nav panels have no URL search params to hold ?variant=.
let current: VariantKey = "C";
const listeners = new Set<() => void>();
function setVariant(key: VariantKey) {
  current = key;
  for (const listener of listeners) listener();
}
function useVariant(): VariantKey {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => current,
  );
}

const VERSION = "1.1.0"; // prototype: hardcoded, real code reads package.json
function osName() {
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Unknown";
}
function bugReportUrl() {
  const params = new URLSearchParams({ template: "bug_report.yml", labels: "bug,needs-triage", version: VERSION, os: osName() });
  return `https://github.com/AlsoKnownAs-Ax/bb-plugin-pr-xray/issues/new?${params}`;
}

// ---------- Review page header ----------

export function ReportBugHeaderButton() {
  const variant = useVariant();

  if (variant === "A")
    return (
      <Button size="sm" variant="ghost" asChild>
        <a href={bugReportUrl()} target="_blank" rel="noreferrer">
          <Icon name="Bug" />
          Report a bug
        </a>
      </Button>
    );

  if (variant === "B")
    return (
      <Button size="sm" variant="ghost" asChild>
        <a href={bugReportUrl()} target="_blank" rel="noreferrer" aria-label="Report a bug" title="Report a bug on GitHub">
          <Icon name="Bug" />
        </a>
      </Button>
    );

  return (
    <ReportBugPopover align="end">
      {(open) => (
        <TooltipProvider delayDuration={300}>
          <Tooltip open={open ? false : undefined}>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button size="sm" variant="ghost" className="w-8 px-0" aria-label="Report a bug">
                  <Icon name="Bug" />
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent side="bottom">Report a bug</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </ReportBugPopover>
  );
}

// Shared preview: says what GitHub will receive before leaving bb.
// Radix popover: closes on outside click and Escape.
function ReportBugPopover(props: { align: "start" | "end"; children: (open: boolean) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {props.children(open)}
      <PopoverContent align={props.align} aria-labelledby="report-bug-title" className="w-72 space-y-3 text-sm">
        <div className="space-y-1">
          <h2 id="report-bug-title" className="font-semibold">
            Report a bug
          </h2>
          <p className="text-muted-foreground">This opens a new issue on GitHub. You can edit it before you submit.</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <dt className="text-muted-foreground">Plugin version</dt>
          <dd className="tabular-nums">{VERSION}</dd>
          <dt className="text-muted-foreground">OS</dt>
          <dd>{osName()}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">The PR isn't included. If it's public, add its link to the issue.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" asChild onClick={() => setOpen(false)}>
            <a href={bugReportUrl()} target="_blank" rel="noreferrer">
              Open GitHub
              <Icon name="ExternalLink" />
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ReportDetails() {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded border border-border px-2 py-1.5 font-mono text-xs">
      <dt className="text-muted-foreground">version</dt>
      <dd>{VERSION}</dd>
      <dt className="text-muted-foreground">os</dt>
      <dd>{osName()}</dd>
    </dl>
  );
}

// ---------- Settings section ----------

export function ReportBugSettings() {
  const variant = useVariant();

  if (variant === "A")
    return (
      <p className="border-t border-border pt-4 text-sm text-muted-foreground">
        Something not working?{" "}
        <a href={bugReportUrl()} target="_blank" rel="noreferrer" className="text-foreground underline-offset-2 hover:underline">
          Report a bug on GitHub
        </a>
        .
      </p>
    );

  if (variant === "B")
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium">Support</div>
        <p className="text-sm text-muted-foreground">
          Report a bug on GitHub. Your plugin version and OS are filled in for you, and nothing is sent until you submit.
        </p>
        <ReportDetails />
        <Button size="sm" variant="outline" asChild>
          <a href={bugReportUrl()} target="_blank" rel="noreferrer">
            <Icon name="Bug" />
            Report a bug
          </a>
        </Button>
      </div>
    );

  const link = "rounded-sm hover:text-foreground hover:underline underline-offset-2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>
        PR X-ray <span className="tabular-nums">{VERSION}</span>
      </span>
      <span aria-hidden="true">·</span>
      <ReportBugPopover align="start">
        {() => (
          <PopoverTrigger asChild>
            <button type="button" className={`flex cursor-pointer items-center gap-1 ${link}`}>
              <Icon name="Bug" className="size-3" />
              Report a bug
            </button>
          </PopoverTrigger>
        )}
      </ReportBugPopover>
      <span aria-hidden="true">·</span>
      <a href="https://github.com/AlsoKnownAs-Ax/bb-plugin-pr-xray" target="_blank" rel="noreferrer" className={link}>
        GitHub
      </a>
    </div>
  );
}

// ---------- Floating switcher ----------

export function PrototypeSwitcher() {
  const variant = useVariant();
  const index = VARIANTS.findIndex((v) => v.key === variant);
  const step = (delta: number) => setVariant(VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length]!.key);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-fuchsia-600 px-2 py-1 text-sm text-white shadow-lg">
      <button type="button" className="rounded-full px-2 hover:bg-white/20" onClick={() => step(-1)} aria-label="Previous variant">
        ←
      </button>
      <span className="font-medium">
        {variant} ({VARIANTS[index]!.name})
      </span>
      <button type="button" className="rounded-full px-2 hover:bg-white/20" onClick={() => step(1)} aria-label="Next variant">
        →
      </button>
    </div>
  );
}
