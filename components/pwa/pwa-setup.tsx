'use client';

import { useEffect } from 'react';
import { analytics } from '@/lib/analytics';
import { isStandalone, setInstallPrompt, type BeforeInstallPromptEvent } from '@/lib/pwa';

/**
 * The installed-app plumbing, mounted once in the root layout. Renders nothing.
 *
 * - Registers /sw.js, whose only job is an offline page (see the file).
 *   Production only: in `next dev` a service worker outlives the code it came
 *   with and makes stale-page bugs impossible to reason about.
 * - Keeps the browser's install prompt for the footer's "Install the app".
 * - Tags analytics with the display mode, and reports installs.
 */
export function PwaSetup() {
  useEffect(() => {
    analytics.registerDisplayMode(isStandalone() ? 'standalone' : 'browser');

    // Not preventDefault(): the browser's own install UI (Android's
    // mini-infobar, the address-bar icon) stays as it is. We only keep the
    // event so the footer button can raise the same prompt on request.
    const onPrompt = (event: Event) => setInstallPrompt(event as BeforeInstallPromptEvent);
    const onInstalled = () => {
      setInstallPrompt(null);
      analytics.appInstalled();
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .catch((error) => console.warn('Service worker registration failed:', error));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  return null;
}
