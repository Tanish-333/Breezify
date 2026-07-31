"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import { cn } from "@/lib/utils";
import { downloadZip } from "@/lib/zip";
import { withWatermark } from "@/lib/watermark";
import { Button } from "@/components/ui/button";
import {
  Check,
  ChevronRight,
  Copy,
  Download,
  File,
  FileCode2,
  FileJson,
  FileText,
  Folder,
  Loader2,
  Lock,
} from "lucide-react";

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    mjs: "javascript",
    cjs: "javascript",
    json: "json",
    css: "css",
    scss: "scss",
    html: "html",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
    sh: "shell",
    py: "python",
    sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

function iconFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (["json"].includes(ext)) return FileJson;
  if (["md", "txt"].includes(ext)) return FileText;
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "css", "scss", "html", "py", "sql"].includes(ext))
    return FileCode2;
  return File;
}

interface TreeNode {
  name: string;
  path: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

function buildTree(paths: string[]): TreeNode {
  const root: TreeNode = { name: "", path: "", children: new Map(), isFile: false };
  for (const path of paths) {
    const segments = path.split("/").filter(Boolean);
    let node = root;
    segments.forEach((segment, i) => {
      const isFile = i === segments.length - 1;
      const childPath = segments.slice(0, i + 1).join("/");
      if (!node.children.has(segment)) {
        node.children.set(segment, {
          name: segment,
          path: childPath,
          children: new Map(),
          isFile,
        });
      }
      node = node.children.get(segment)!;
    });
  }
  return root;
}

function sortedChildren(node: TreeNode): TreeNode[] {
  return Array.from(node.children.values()).sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

function TreeRow({
  node,
  depth,
  active,
  onSelect,
  collapsed,
  toggle,
  streamingPaths,
}: {
  node: TreeNode;
  depth: number;
  active: string;
  onSelect: (path: string) => void;
  collapsed: Set<string>;
  toggle: (path: string) => void;
  streamingPaths?: Set<string>;
}) {
  const isOpen = !collapsed.has(node.path);
  const Icon = node.isFile ? iconFor(node.name) : Folder;
  const isActive = node.isFile && active === node.path;
  const isStreaming = streamingPaths?.has(node.path);

  return (
    <>
      <button
        onClick={() => (node.isFile ? onSelect(node.path) : toggle(node.path))}
        className={cn(
          "flex w-full items-center gap-1.5 py-1.5 pr-2 text-left text-xs transition-colors",
          isActive
            ? "bg-foreground font-medium text-background"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
        style={{ paddingLeft: `${depth * 12 + 10}px` }}
        title={node.path}
      >
        {!node.isFile && (
          <ChevronRight
            className={cn("h-3 w-3 shrink-0 transition-transform", isOpen && "rotate-90")}
          />
        )}
        <Icon className={cn("h-3.5 w-3.5 shrink-0", node.isFile && "ml-0")} />
        <span className="truncate">{node.name}</span>
        {isStreaming && <Loader2 className="ml-auto h-3 w-3 shrink-0 animate-spin" />}
      </button>
      {!node.isFile &&
        isOpen &&
        sortedChildren(node).map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            depth={depth + 1}
            active={active}
            onSelect={onSelect}
            collapsed={collapsed}
            toggle={toggle}
            streamingPaths={streamingPaths}
          />
        ))}
    </>
  );
}

export function CodePreview({
  files,
  appName = "app",
  streamingPaths,
  removeBadge = false,
}: {
  files: Record<string, string>;
  appName?: string;
  streamingPaths?: Set<string>;
  /** Paid plans export clean; free stays badged. */
  removeBadge?: boolean;
}) {
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const [active, setActive] = useState(paths[0] ?? "");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);

  const tree = useMemo(() => buildTree(paths), [paths]);

  // The first file can arrive after mount while streaming.
  const activePath = active && files[active] !== undefined ? active : paths[0] ?? "";

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function copyActive() {
    if (!activePath) return;
    try {
      await navigator.clipboard.writeText(files[activePath] ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard can be blocked by permissions; failing silently is fine here.
    }
  }

  if (paths.length === 0) return null;

  const totalLines = Object.values(files).reduce(
    (sum, content) => sum + content.split("\n").length,
    0
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{paths.length} files</span>
          <span>{totalLines.toLocaleString()} lines</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copyActive} disabled={!activePath}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy file"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadZip(withWatermark(files, !removeBadge), appName)}
          >
            <Download className="h-3.5 w-3.5" />
            Download ZIP
          </Button>
        </div>
      </div>
      {!removeBadge && (
        <div className="flex items-center gap-1.5 border-b border-border bg-muted/20 px-4 py-1.5 text-[11px] text-muted-foreground">
          <Lock className="h-3 w-3 shrink-0" />
          Exports include the Feather 123 badge.{" "}
          <Link href="/billing" className="font-medium text-foreground hover:underline">
            Upgrade to remove it
          </Link>
        </div>
      )}

      <div className="grid h-[560px] grid-cols-1 sm:grid-cols-[240px_1fr]">
        <div className="overflow-y-auto border-b border-border bg-muted/20 py-1 sm:border-b-0 sm:border-r">
          {sortedChildren(tree).map((child) => (
            <TreeRow
              key={child.path}
              node={child}
              depth={0}
              active={activePath}
              onSelect={setActive}
              collapsed={collapsed}
              toggle={toggle}
              streamingPaths={streamingPaths}
            />
          ))}
        </div>
        <div className="min-w-0">
          {activePath && (
            <Editor
              path={activePath}
              language={languageFor(activePath)}
              value={files[activePath]}
              theme="vs-dark"
              options={{
                readOnly: true,
                minimap: { enabled: false },
                fontSize: 13,
                scrollBeyondLastLine: false,
                padding: { top: 14 },
                renderLineHighlight: "none",
                smoothScrolling: true,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
