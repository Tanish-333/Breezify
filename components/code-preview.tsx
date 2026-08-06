"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Editor from "@monaco-editor/react";
import { cn } from "@/lib/utils";
import { downloadZip } from "@/lib/zip";
import { withWatermark } from "@/lib/watermark";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
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
  Save,
  Undo2,
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
  locked = false,
  editable = false,
  onSave,
  versionKey,
}: {
  files: Record<string, string>;
  appName?: string;
  streamingPaths?: Set<string>;
  /** Viewing, copying, and exporting code is a Plus-and-up feature. */
  locked?: boolean;
  /** Lets the active file be hand-edited directly, saved as a new "edit" turn. Same plan gate as viewing (see `locked`) — pass alongside `onSave`. */
  editable?: boolean;
  onSave?: (files: Record<string, string>) => Promise<void>;
  /** Something that changes only on a genuine new generation/refine/revert (e.g. turn count) — see the effect below for why this can't just be `files` itself. */
  versionKey?: string | number;
}) {
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const [active, setActive] = useState(paths[0] ?? "");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  // Keyed by path, only ever holds files that actually differ from `files`.
  const [pendingEdits, setPendingEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const tree = useMemo(() => buildTree(paths), [paths]);

  // A fresh generation/refine/revert landed — anything edited against the
  // old file set no longer applies cleanly to the new one, and silently
  // keeping it around risks saving a hand edit over AI-written changes the
  // user hasn't even seen yet.
  //
  // Keyed on `versionKey`, not `files` itself: the parent recomputes `files`
  // fresh (a brand-new object reference) on every Firestore snapshot of the
  // app doc, including ones that have nothing to do with its code — the
  // public visit counter incrementing, a deploy status flipping, a
  // collaborator's refine lock toggling. Depending on `files`' identity
  // meant any of those could silently wipe an in-progress hand edit with no
  // warning, mid-keystroke, for a reason the user never saw. `versionKey`
  // (the caller passes something like turn count) only changes when the
  // code genuinely did.
  useEffect(() => {
    setPendingEdits({});
    setSaveError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey]);

  // The first file can arrive after mount while streaming.
  const activePath = active && files[active] !== undefined ? active : paths[0] ?? "";
  const dirtyCount = Object.keys(pendingEdits).length;

  async function saveEdits() {
    if (!onSave || dirtyCount === 0) return;
    setSaving(true);
    setSaveError("");
    try {
      await onSave({ ...files, ...pendingEdits });
      setPendingEdits({});
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save your changes.");
    } finally {
      setSaving(false);
    }
  }

  function discardEdits() {
    setPendingEdits({});
    setSaveError("");
  }

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
      await navigator.clipboard.writeText(pendingEdits[activePath] ?? files[activePath] ?? "");
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

  if (locked) {
    return (
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="font-medium text-foreground">{paths.length} files</span>
            <span>{totalLines.toLocaleString()} lines</span>
          </div>
        </div>
        <div className="flex h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <Lock className="h-6 w-6 text-muted-foreground" strokeWidth={1.5} />
          <p className="max-w-xs text-sm text-muted-foreground">
            Viewing, copying, and exporting your generated code is a Plus feature.
          </p>
          <Link href="/billing">
            <Button size="sm">Upgrade to Plus</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-2.5">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{paths.length} files</span>
          <span>{totalLines.toLocaleString()} lines</span>
        </div>
        <div className="flex items-center gap-2">
          {editable && dirtyCount > 0 && (
            <>
              <span className="text-xs text-warning">
                {dirtyCount} file{dirtyCount > 1 ? "s" : ""} unsaved
              </span>
              <Button variant="ghost" size="sm" onClick={discardEdits} disabled={saving}>
                <Undo2 className="h-3.5 w-3.5" />
                Discard
              </Button>
              <Button size="sm" onClick={saveEdits} loading={saving}>
                <Save className="h-3.5 w-3.5" />
                Save changes
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" onClick={copyActive} disabled={!activePath}>
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy file"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => downloadZip(withWatermark({ ...files, ...pendingEdits }, false), appName)}
          >
            <Download className="h-3.5 w-3.5" />
            Download ZIP
          </Button>
        </div>
      </div>

      {saveError && (
        <div className="flex items-start gap-2 border-b border-error/30 bg-error/5 px-4 py-2.5 text-sm text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{saveError}</span>
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
              value={pendingEdits[activePath] ?? files[activePath]}
              onChange={
                editable
                  ? (value) => {
                      const next = value ?? "";
                      setPendingEdits((prev) => {
                        // Editing back to exactly the original content drops
                        // it from pendingEdits rather than saving a no-op
                        // "change" — keeps dirtyCount (and the save button)
                        // honest about whether there's anything to save.
                        if (next === files[activePath]) {
                          if (!(activePath in prev)) return prev;
                          const { [activePath]: _drop, ...rest } = prev;
                          return rest;
                        }
                        return { ...prev, [activePath]: next };
                      });
                    }
                  : undefined
              }
              theme="vs-dark"
              options={{
                readOnly: !editable,
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
