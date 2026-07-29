"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { cn } from "@/lib/utils";
import { FileCode2 } from "lucide-react";

function languageFor(path: string) {
  const ext = path.split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    css: "css",
    html: "html",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
  };
  return map[ext] ?? "plaintext";
}

export function CodePreview({ files }: { files: Record<string, string> }) {
  const paths = Object.keys(files);
  const [active, setActive] = useState(paths[0]);

  if (paths.length === 0) return null;

  return (
    <div className="monaco-shell grid grid-cols-[220px_1fr] h-[560px]">
      <div className="overflow-y-auto border-r border-border bg-muted/50">
        {paths.map((path) => (
          <button
            key={path}
            onClick={() => setActive(path)}
            className={cn(
              "flex w-full items-center gap-2 truncate px-3 py-2 text-left text-xs transition-colors",
              active === path
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
            title={path}
          >
            <FileCode2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{path}</span>
          </button>
        ))}
      </div>
      <Editor
        path={active}
        language={languageFor(active)}
        value={files[active]}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          padding: { top: 12 },
        }}
      />
    </div>
  );
}
