export function Footer() {
  return (
    <footer className="border-t bg-background">
      <div className="container flex flex-col items-center justify-between gap-4 py-8 md:h-24 md:flex-row md:py-0">
        <div className="flex flex-col items-center gap-4 px-4 md:flex-row md:gap-2 md:px-0">
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built with transparency and accountability in mind.{' '}
            <a
              href="/about"
              className="font-medium underline underline-offset-4"
            >
              Learn more
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}