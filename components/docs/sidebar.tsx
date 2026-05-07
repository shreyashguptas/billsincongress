"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string };
type Section = { title: string; items: Item[] };

const SECTIONS: Section[] = [
  {
    title: "Get started",
    items: [
      { href: "/docs", label: "Overview" },
      { href: "/docs/quickstart", label: "Quickstart" },
      { href: "/docs/authentication", label: "Authentication" },
      { href: "/docs/rate-limits", label: "Rate limits" },
      { href: "/docs/pagination", label: "Pagination" },
      { href: "/docs/errors", label: "Errors" },
      { href: "/docs/changelog", label: "Changelog" },
    ],
  },
  {
    title: "API reference",
    items: [
      { href: "/docs/api/bills", label: "Bills" },
      { href: "/docs/api/congresses", label: "Congresses" },
      { href: "/docs/api/policy-areas", label: "Policy areas" },
      { href: "/docs/api/sponsors", label: "Sponsors" },
      { href: "/docs/api/sync-status", label: "Sync status" },
    ],
  },
];

export function DocsSidebar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Docs">
      {SECTIONS.map((section) => (
        <div key={section.title} className="mb-5">
          <p className="label-eyebrow mb-2">{section.title}</p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/docs" && pathname?.startsWith(item.href));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={cn(
                      "block rounded-sm px-2 py-1 text-sm",
                      active
                        ? "bg-secondary text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
