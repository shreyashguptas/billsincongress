/**
 * Installed-app (PWA) state shared by components/pwa/. Browser-only: every
 * function here reads `window` or `navigator`, so call it from an effect or an
 * event handler, never during render on the server.
 */

/** Chromium's install prompt event, which TypeScript's DOM types do not name. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** True when the site is running as the installed app rather than in a tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari's own flag, set only for a Home Screen launch.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iPhone or iPad. iPadOS reports itself as a Mac, so a Mac with a touch
 * screen is an iPad. Every browser on iOS can add to the Home Screen (from the
 * Share menu, since iOS 16.4) and none of them has an install prompt to call.
 */
export function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// The browser offers its install prompt once, as an event, usually soon after
// load — before the footer's button has necessarily mounted. PwaSetup catches
// it for the whole page and keeps it here until someone asks.
let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function setInstallPrompt(event: BeforeInstallPromptEvent | null) {
  deferredPrompt = event;
  listeners.forEach((listener) => listener());
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return deferredPrompt;
}

export function subscribeInstallPrompt(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
