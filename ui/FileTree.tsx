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
export function FileTree({ files, onOpen, prUrl, unlisted }: { files: PrFile[]; onOpen: (path: string) => void; prUrl: string; unlisted: number }) {
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
      <Rows nodes={tree} closed={closed} onToggle={toggle} onOpen={onOpen} prUrl={prUrl} />
      {unlisted > 0 ? (
        <a href={`${prUrl}/files`} target="_blank" rel="noreferrer" className={cn(ROW, "pl-1.5 font-sans text-muted-foreground hover:text-foreground", FOCUS)}>
          {notListedLabel(unlisted)}
          <Icon name="ExternalLink" className="size-3 shrink-0" />
        </a>
      ) : null}
    </div>
  );
}

type RowsProps = { closed: Set<string>; onToggle: (path: string) => void; onOpen: (path: string) => void; prUrl: string };

function Rows({ nodes, ...props }: RowsProps & { nodes: FileTreeNode[] }) {
  return nodes.map((node) =>
    node.kind === "dir" ? <DirRow key={`d:${node.path}`} node={node} {...props} /> : <FileRow key={node.file.path} node={node} onOpen={props.onOpen} prUrl={props.prUrl} />,
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

function FileRow({ node, onOpen, prUrl }: { node: FileTreeFile; onOpen: (path: string) => void; prUrl: string }) {
  const { file } = node;
  const status = fileStatus(file);
  const patchless = isPatchless(file);
  const Row = patchless ? "a" : "button";
  const action = patchless ? { href: `${prUrl}/files`, target: "_blank", rel: "noreferrer" } : { type: "button" as const, onClick: () => onOpen(file.path) };
  return (
    <Row {...action} title={fileTooltip(file)} className={cn(ROW, "pl-1.5", FOCUS, patchless && "text-muted-foreground")}>
      <span className="min-w-0 truncate">{node.name}</span>
      {patchless ? <Icon name="ExternalLink" className="size-3 shrink-0" /> : null}
      <span className="flex-1" />
      <Counts additions={file.additions} deletions={file.deletions} />
      <span title={status.label} aria-label={status.label} className={cn("w-2.5 shrink-0 text-center text-[10px] font-semibold", STATUS_CLASS[status.letter] ?? "text-muted-foreground")}>
        {status.letter}
      </span>
    </Row>
  );
}

function Counts({ additions, deletions, quiet }: { additions: number; deletions: number; quiet?: boolean }) {
  return (
    <span className={cn("shrink-0 text-[10px] tabular-nums", quiet && "opacity-60")} aria-label={`${additions} added, ${deletions} removed`}>
      <span className="text-success">+{additions}</span> <span className="text-destructive">−{deletions}</span>
    </span>
  );
}
