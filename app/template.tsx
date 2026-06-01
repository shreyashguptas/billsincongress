// Page-to-page transition layer.
//
// Next.js re-mounts `template.tsx` on every navigation (unlike `layout.tsx`,
// which persists), so this wrapper re-runs its CSS enter animation each time
// the route changes — giving every page a subtle fade-and-rise as it appears.
// The persistent chrome (navigation bar, footer) lives in `layout.tsx` and is
// intentionally left outside this wrapper so only the page content animates.
//
// Implemented as a plain CSS animation (see `.animate-page-in` in globals.css)
// rather than a motion library: it needs no client JS, ends at
// `transform: none`, and is automatically disabled by the global
// `prefers-reduced-motion` rule for users who ask for reduced motion.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="animate-page-in">{children}</div>;
}
