import type { ReactNode } from "react";

import { ChamberMark } from "@/components/brand/logo";
import { Separator } from "@/components/ui/separator";

/**
 * The frame every auth page shares: a narrow raised card centred on the page,
 * the chamber mark over a panel-size title, then the form. Ink on paper, no
 * hue (Documentation/brand.md, "The chrome").
 */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="container-editorial flex flex-1 items-center justify-center py-12 sm:py-16">
      <div className="w-full max-w-md rounded-lg border border-line bg-raised p-6 sm:p-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <ChamberMark className="h-10 w-10 text-ink" />
          <h1 className="mt-4 text-display-sm text-ink">{title}</h1>
          {description && <p className="mt-2 max-w-[36ch] text-[15px] leading-relaxed text-ink-2">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

/** The hairline with "or with email" between the Google button and the form. */
export function AuthDivider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[13px] text-ink-3">
      <Separator className="w-auto flex-1" />
      {children}
      <Separator className="w-auto flex-1" />
    </div>
  );
}
