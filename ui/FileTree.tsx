import { useMemo, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { CONTROL_HOVER_TRANSITION } from "@/components/ui/motion";
import { cn } from "@/lib/utils";
import type { PrFile } from "../shared/schema";
import { buildFileTree, fileStatus, fileTooltip, isPatchless, notListedLabel, type FileTreeDir, type FileTreeFile, type FileTreeNode } from "./file-tree";

const ROW = cn("flex h-6 w-full min-w-0 items-center gap-1.5 rounded-md pr-1.5 text-left text-xs hover:bg-state-hover", CONTROL_HOVER_TRANSITION);
const FOCUS = "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";
// Only added/deleted get a color; the rest stay quiet.
const STATUS_CLASS: Record<string, string> = { A: "text-success", D: "text-destructive" };

/** The File tree: the PR's changed files by directory. Clicking a file opens it in the diff; patchless ones open GitHub. */
export function FileTree({
  files,
  prUrl,
  unlisted,
  ...props
}: {
  files: PrFile[];
  groupsOfPath: Map<string, number[]>;
  onOpen: OnOpen;
  prUrl: string;
  unlisted: number;
  /** Paths whose every hunk is viewed. */
  viewed: Set<string>;
  /** The file on screen in the diff. */
  activePath: string | null;
}) {
  const tree = useMemo(() => buildFileTree(files), [files]);
  // Folders start expanded, so track the collapsed ones.
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const toggle = (path: string) =>
    setClosed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });
  if (files.length === 0 && unlisted === 0) return <p className="px-2 py-1 text-xs text-muted-foreground">No changed files.</p>;
  return (
    <div className="font-mono">
      <Rows nodes={tree} closed={closed} onToggle={toggle} prUrl={prUrl} {...props} />
      {unlisted > 0 ? (
        <a href={`${prUrl}/files`} target="_blank" rel="noreferrer" className={cn(ROW, "pl-1.5 font-sans text-muted-foreground hover:text-foreground", FOCUS)}>
          {notListedLabel(unlisted)}
          <Icon name="ExternalLink" className="size-3 shrink-0" />
        </a>
      ) : null}
    </div>
  );
}

/** `groupNumber` is the 1-based reading-path position to jump to; without it, the file's first appearance. */
type OnOpen = (path: string, groupNumber?: number) => void;
type RowsProps = {
  closed: Set<string>;
  onToggle: (path: string) => void;
  groupsOfPath: Map<string, number[]>;
  onOpen: OnOpen;
  prUrl: string;
  viewed: Set<string>;
  activePath: string | null;
};

function Rows({ nodes, ...props }: RowsProps & { nodes: FileTreeNode[] }) {
  return nodes.map((node) =>
    node.kind === "dir" ? (
      <DirRow key={`d:${node.path}`} node={node} {...props} />
    ) : (
      <FileRow
        key={node.file.path}
        node={node}
        groups={props.groupsOfPath.get(node.file.path) ?? []}
        onOpen={props.onOpen}
        prUrl={props.prUrl}
        viewed={props.viewed.has(node.file.path)}
        active={props.activePath === node.file.path}
      />
    ),
  );
}

function DirRow({ node, ...props }: RowsProps & { node: FileTreeDir }) {
  const open = !props.closed.has(node.path);
  return (
    <div>
      <button type="button" aria-expanded={open} title={node.path} onClick={() => props.onToggle(node.path)} className={cn(ROW, "pl-0.5", FOCUS)}>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} className="size-3 shrink-0 text-muted-foreground" />
        <Icon name={open ? "FolderOpen" : "Folder"} fallback="Folder" className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        <Counts additions={node.additions} deletions={node.deletions} quiet />
        <span className="w-2.5 shrink-0" />
      </button>
      {open ? (
        // Indent guide: one hairline per level instead of bare padding.
        <div className="ml-2 border-l border-border pl-1.5">
          <Rows nodes={node.children} {...props} />
        </div>
      ) : null}
    </div>
  );
}

function FileRow({
  node,
  groups,
  onOpen,
  prUrl,
  viewed,
  active,
}: {
  node: FileTreeFile;
  groups: number[];
  onOpen: OnOpen;
  prUrl: string;
  viewed: boolean;
  active: boolean;
}) {
  const { file } = node;
  const status = fileStatus(file);
  const patchless = isPatchless(file);
  const Name = patchless ? "a" : "button";
  const action = patchless ? { href: `${prUrl}/files`, target: "_blank", rel: "noreferrer" } : { type: "button" as const, onClick: () => onOpen(file.path) };
  // A div, not a button, so the group chips can be buttons of their own.
  return (
    <div className={cn(ROW, "pl-1.5", active && "bg-state-active", (patchless || viewed) && "text-muted-foreground")}>
      <Name
        {...action}
        title={fileTooltip(file)}
        aria-current={active ? "location" : undefined}
        className={cn("flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left", FOCUS)}
      >
        <span className="min-w-0 truncate">{node.name}</span>
        {patchless ? <Icon name="ExternalLink" className="size-3 shrink-0" /> : null}
      </Name>
      {groups.length > 1
        ? groups.map((n) => (
            <button
              key={n}
              type="button"
              title={`Jump to group ${n}`}
              aria-label={`Jump to ${file.path} in group ${n}`}
              onClick={() => onOpen(file.path, n)}
              className={cn("h-4 shrink-0 rounded-full border border-border px-1.5 text-[10px] leading-none tabular-nums text-muted-foreground hover:bg-state-hover hover:text-foreground", CONTROL_HOVER_TRANSITION, FOCUS)}
            >
              {n}
            </button>
          ))
        : null}
      {viewed ? <Icon name="Check" aria-label="Viewed" className="size-3 shrink-0" /> : null}
      <Counts additions={file.additions} deletions={file.deletions} quiet={viewed} />
      <span title={status.label} aria-label={status.label} className={cn("w-2.5 shrink-0 text-center text-[10px] font-semibold", STATUS_CLASS[status.letter] ?? "text-muted-foreground")}>
        {status.letter}
      </span>
    </div>
  );
}

function Counts({ additions, deletions, quiet }: { additions: number; deletions: number; quiet?: boolean }) {
  return (
    <span className={cn("shrink-0 text-[10px] tabular-nums", quiet && "opacity-60")} aria-label={`${additions} added, ${deletions} removed`}>
      <span className="text-success">+{additions}</span> <span className="text-destructive">−{deletions}</span>
    </span>
  );
}
