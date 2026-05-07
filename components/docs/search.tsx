"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type Result = { url: string; title: string; excerpt: string };

// Lightweight in-memory search over the docs route table. Lives in this file
// rather than a SaaS index because (a) the docs are small and (b) the data
// is publicly indexable so we don't need anything fancy.
const INDEX: Result[] = [
  { url: "/docs", title: "Overview", excerpt: "What the API is, who it's for, the 30-second curl example." },
  { url: "/docs/quickstart", title: "Quickstart", excerpt: "Mint a token, make your first request, paginate." },
  { url: "/docs/authentication", title: "Authentication", excerpt: "Bearer tokens, format, rotation, security best practices." },
  { url: "/docs/rate-limits", title: "Rate limits", excerpt: "1000/hour and 10,000/day per token. Headers, retry, backoff." },
  { url: "/docs/pagination", title: "Pagination", excerpt: "Cursor-based pagination with next_cursor and has_more." },
  { url: "/docs/errors", title: "Errors", excerpt: "Error JSON shape, status codes, common pitfalls." },
  { url: "/docs/changelog", title: "Changelog", excerpt: "Versioned, dated changes to the API." },
  { url: "/docs/api/bills", title: "Bills · Reference", excerpt: "List bills, filter by status, sponsor, congress, policy area, free-text title." },
  { url: "/docs/api/congresses", title: "Congresses · Reference", excerpt: "Per-congress overview, dashboard, chamber breakdown." },
  { url: "/docs/api/policy-areas", title: "Policy areas · Reference", excerpt: "Distinct policy area names." },
  { url: "/docs/api/sponsors", title: "Sponsors · Reference", excerpt: "Every sponsor across every congress, deduped by full name." },
  { url: "/docs/api/sync-status", title: "Sync status · Reference", excerpt: "Last completed sync run timestamp." },
];

export function DocsSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = React.useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return INDEX.filter(
      (r) =>
        r.title.toLowerCase().includes(query) ||
        r.excerpt.toLowerCase().includes(query),
    ).slice(0, 8);
  }, [q]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          placeholder="Search docs (⌘K)"
          className="pl-7 h-9 text-sm"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 100)}
        />
      </div>
      {open && results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-10 rounded-md border border-border bg-background shadow-md py-1 max-h-80 overflow-auto">
          {results.map((r) => (
            <li key={r.url}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-secondary text-sm"
                onMouseDown={(e) => {
                  e.preventDefault();
                  router.push(r.url);
                  setOpen(false);
                  setQ("");
                }}
              >
                <p className="font-medium">{r.title}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-1">
                  {r.excerpt}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
