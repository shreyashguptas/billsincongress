"use client";

import { Copy, Check } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  POST: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  PATCH: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  DELETE: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

export function Endpoint({
  method,
  path,
  className,
}: {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const full = `https://billsincongress.com/api/v1${path}`;
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2 text-sm",
        className,
      )}
    >
      <span
        className={cn(
          "rounded-sm px-1.5 py-0.5 font-mono text-[11px] font-semibold",
          METHOD_COLORS[method] ?? "bg-secondary",
        )}
      >
        {method}
      </span>
      <code className="flex-1 truncate font-mono text-xs">{full}</code>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy URL"}
        className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* ignore */
          }
        }}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
}
