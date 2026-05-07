"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";

export function ResponseExample({ value }: { value: unknown }) {
  const json = React.useMemo(() => JSON.stringify(value, null, 2), [value]);
  const [copied, setCopied] = React.useState(false);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-2 py-1">
        <span className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          200 — example response
        </span>
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy JSON"}
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(json);
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
      <pre className="overflow-x-auto bg-foreground/[0.04] dark:bg-foreground/[0.06] p-3 text-[12px] leading-relaxed font-mono">
        <code>{json}</code>
      </pre>
    </div>
  );
}
