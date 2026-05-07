import Link from "next/link";
import type { Metadata } from "next";
import { DocsSidebar } from "@/components/docs/sidebar";
import { DocsSearch } from "@/components/docs/search";

export const metadata: Metadata = {
  title: {
    default: "Developers",
    template: "%s · Developers",
  },
  description:
    "Build with the same data that powers billsincongress.com. Read-only REST API, free tier, generous limits.",
};

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="border-t border-border">
      <div className="container-editorial grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] py-10">
        <aside className="lg:sticky lg:top-24 self-start">
          <div className="mb-4">
            <DocsSearch />
          </div>
          <DocsSidebar />
          <p className="mt-6 text-[11px] text-muted-foreground">
            Need something not listed?{" "}
            <Link
              href="/about"
              className="underline underline-offset-4 decoration-border hover:decoration-foreground"
            >
              Get in touch
            </Link>
            .
          </p>
        </aside>
        <article className="docs-prose min-w-0">{children}</article>
      </div>
    </div>
  );
}
