"use client";

import * as React from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type CodeSample = {
  lang: string; // display label
  id: string; // stable id for persistence
  code: string;
};

const STORAGE_KEY = "docs.codeTabs.lang";

export function CodeTabs({
  samples,
  className,
}: {
  samples: CodeSample[];
  className?: string;
}) {
  const [active, setActive] = React.useState<string>(
    samples[0]?.id ?? "curl",
  );

  // Persist the chosen language across page navigation. Read once on mount;
  // ignore if the persisted choice doesn't match anything in the current
  // sample set (different endpoints surface different language sets when
  // examples genuinely differ).
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && samples.some((s) => s.id === stored)) {
        setActive(stored);
      }
    } catch {
      // localStorage may throw in strict cookie mode; fall back to default.
    }
  }, [samples]);

  function pick(id: string) {
    setActive(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  const current = samples.find((s) => s.id === active) ?? samples[0];
  const [copied, setCopied] = React.useState(false);

  return (
    <div className={cn("rounded-md border border-border overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-2 py-1">
        <div className="flex flex-wrap gap-0.5 overflow-x-auto">
          {samples.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => pick(s.id)}
              className={cn(
                "px-2 py-1 text-[11px] rounded-sm transition-colors whitespace-nowrap",
                active === s.id
                  ? "bg-background text-foreground font-medium border border-border"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.lang}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label={copied ? "Copied" : "Copy code"}
          className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
          onClick={async () => {
            if (!current) return;
            try {
              await navigator.clipboard.writeText(current.code);
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
        <code>{current?.code ?? ""}</code>
      </pre>
    </div>
  );
}
