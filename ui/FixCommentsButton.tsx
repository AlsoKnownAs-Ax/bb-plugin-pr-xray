// One "fix comments" button with a dropdown that picks what it does, like GitHub's merge button.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { savedFixScope } from "../shared/fix-scope";
import type { FixScope } from "../shared/schema";

const STORAGE_KEY = "pr-xray:fix-scope";
const LABELS: Record<FixScope, string> = { mine: "Fix my open comments", all: "Fix all open comments" };
const HINTS: Record<FixScope, string> = {
  mine: "The agent reads only your comments.",
  all: "The agent also reads other people's comments. Asks you to confirm each time.",
};
const SCOPES: FixScope[] = ["mine", "all"];

export function FixCommentsButton({ counts, onFix }: { counts: Record<FixScope, number>; onFix: (scope: FixScope) => void }) {
  const [scope, setScope] = useState(() => savedFixScope(localStorage.getItem(STORAGE_KEY)));
  const choose = (next: FixScope) => {
    localStorage.setItem(STORAGE_KEY, next);
    setScope(next);
  };
  return (
    <div className="flex">
      <Button className="min-w-0 flex-1 rounded-r-none" size="sm" variant="outline" disabled={counts[scope] === 0} onClick={() => onFix(scope)}>
        <Icon name="Bot" />
        <span className="truncate">
          {LABELS[scope]}
          {counts[scope] ? ` (${counts[scope]})` : ""}
        </span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button className="-ml-px shrink-0 rounded-l-none px-2" size="sm" variant="outline" aria-label="Choose which comments to fix">
            <Icon name="ChevronDown" className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-72">
          {SCOPES.map((option) => (
            <DropdownMenuItem key={option} className="items-start" onSelect={() => choose(option)}>
              {option === scope ? <Icon name="Check" className="mt-0.5 size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
              <span>
                <span className="block">
                  {LABELS[option]}
                  {counts[option] ? ` (${counts[option]})` : ""}
                </span>
                <span className="block text-xs text-muted-foreground">{HINTS[option]}</span>
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
