// Shared building blocks for /privacy and /terms. Both pages render the same
// numbered-section layout; keeping one copy stops the two drifting apart.

export function Section({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <span className="col-span-12 sm:col-span-1 font-mono text-sm text-muted-foreground tabular pt-1">
        {String(number).padStart(2, '0')}
      </span>
      <div className="col-span-12 sm:col-span-11">
        <h2 className="font-serif text-display-sm font-semibold tracking-tight mb-3">
          {title}
        </h2>
        <div className="space-y-4 text-base text-muted-foreground leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 hover:text-foreground"
    >
      {children}
    </a>
  );
}
