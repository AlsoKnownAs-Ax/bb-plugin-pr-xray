// "Report a bug": a preview of what GitHub will receive, then a prefilled issue the user submits themselves.
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { version } from "../package.json";
import { FOCUS } from "./FileTree";
import { bugReportUrl, osName, repoUrl } from "./bug-report";

/** The preview popover. `children` gets the open state and must render a `PopoverTrigger`. */
export function ReportBugPopover({ align, children }: { align: "start" | "end"; children: (open: boolean) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const os = osName(navigator.userAgent);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      {children(open)}
      <PopoverContent align={align} aria-labelledby="report-bug-title" mobileTitle="Report a bug" className="w-72 space-y-3 text-sm">
        <div className="space-y-1">
          <h2 id="report-bug-title" className="font-semibold">
            Report a bug
          </h2>
          <p className="text-muted-foreground">This opens a new issue on GitHub. You can edit it before you submit.</p>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-muted/50 px-3 py-2 text-xs">
          <dt className="text-muted-foreground">Plugin version</dt>
          <dd className="tabular-nums">{version}</dd>
          <dt className="text-muted-foreground">OS</dt>
          <dd>{os}</dd>
        </dl>
        <p className="text-xs text-muted-foreground">The PR isn't included. If it's public, add its link to the issue.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" asChild onClick={() => setOpen(false)}>
            <a href={bugReportUrl(version, os)} target="_blank" rel="noreferrer">
              Open GitHub
              <Icon name="ExternalLink" />
            </a>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Keep the tooltip shut while the popover is open; otherwise let it manage itself. */
function tooltipOpen(popoverOpen: boolean): false | undefined {
  if (popoverOpen) {
    return false;
  }

  return undefined;
}

/** Icon-only header button. PopoverTrigger sits outside TooltipTrigger so its data-state drives the active fill. */
export function ReportBugButton() {
  return (
    <ReportBugPopover align="end">
      {(open) => (
        <TooltipProvider delayDuration={300}>
          <Tooltip open={tooltipOpen(open)}>
            <PopoverTrigger asChild>
              <TooltipTrigger asChild>
                <Button size="sm" variant="ghost" className="w-8 px-0" aria-label="Report a bug">
                  <Icon name="Bug" />
                </Button>
              </TooltipTrigger>
            </PopoverTrigger>
            <TooltipContent side="bottom">Report a bug</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </ReportBugPopover>
  );
}

const FOOTER_LINK = cn("rounded-sm underline-offset-2 hover:text-foreground hover:underline", FOCUS);

/** Settings footer: version, "Report a bug" (same preview, start-aligned) and the repo link. */
export function ReportBugFooter() {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
      <span>
        PR X-ray <span className="tabular-nums">{version}</span>
      </span>
      <span className="flex items-center gap-x-2 whitespace-nowrap">
        <span aria-hidden="true">·</span>
        <ReportBugPopover align="start">
          {() => (
            <PopoverTrigger asChild>
              <button type="button" className={cn("flex cursor-pointer items-center gap-1", FOOTER_LINK)}>
                <Icon name="Bug" className="size-3" />
                Report a bug
              </button>
            </PopoverTrigger>
          )}
        </ReportBugPopover>
      </span>
      <span className="flex items-center gap-x-2 whitespace-nowrap">
        <span aria-hidden="true">·</span>
        <a href={repoUrl} target="_blank" rel="noreferrer" className={FOOTER_LINK}>
          GitHub
        </a>
      </span>
    </div>
  );
}
