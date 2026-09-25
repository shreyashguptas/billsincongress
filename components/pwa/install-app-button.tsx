'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus } from 'lucide-react';

import { analytics } from '@/lib/analytics';
import { getInstallPrompt, isIos, isStandalone, subscribeInstallPrompt } from '@/lib/pwa';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** A 16px icon sitting in a line of text, on its baseline rather than above it. */
const INLINE_ICON = 'mr-1 inline-block h-4 w-4 align-[-3px]';

/**
 * "Install the app", in the footer. Shown only where it can do something:
 *
 * - Chrome, Edge and Android, once the browser has offered its install prompt:
 *   the button raises that prompt.
 * - iPhone and iPad, which have no prompt: the button explains Add to Home
 *   Screen, the one way in.
 *
 * Hidden everywhere else, and once the site is already running as the app.
 */
export function InstallAppButton() {
  const prompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPrompt, () => null);
  const [ios, setIos] = useState(false);
  const [open, setOpen] = useState(false);

  // After mount only: the server cannot know the device, and guessing would
  // mismatch the hydrated markup.
  useEffect(() => {
    setIos(isIos() && !isStandalone());
  }, []);

  if (!prompt && !ios) return null;

  const handleClick = async () => {
    if (prompt) {
      await prompt.prompt();
      const { outcome } = await prompt.userChoice;
      analytics.appInstallClicked({ method: 'browser_prompt', outcome });
      return;
    }
    analytics.appInstallClicked({ method: 'ios_instructions' });
    setOpen(true);
  };

  return (
    <>
      <Button type="button" variant="outline" onClick={handleClick}>
        <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Install the app
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Bills in Congress to your Home Screen</DialogTitle>
            <DialogDescription>
              It opens full screen like an app, and a bill is one tap from your Home Screen.
            </DialogDescription>
          </DialogHeader>
          <ol className="mt-2 space-y-4 text-[15px] leading-6 text-ink">
            <li className="flex gap-3">
              <span className="font-mono text-sm text-ink-3 tabular">1</span>
              <span>
                Tap{' '}
                <span className="whitespace-nowrap font-medium">
                  <Share className={INLINE_ICON} strokeWidth={1.75} aria-hidden="true" />
                  Share
                </span>{' '}
                in your browser&rsquo;s toolbar. In Safari it can sit under the{' '}
                <span className="font-medium">&middot;&middot;&middot;</span> menu.
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-sm text-ink-3 tabular">2</span>
              <span>
                Scroll down and choose{' '}
                <span className="whitespace-nowrap font-medium">
                  <SquarePlus className={INLINE_ICON} strokeWidth={1.75} aria-hidden="true" />
                  Add to Home Screen.
                </span>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="font-mono text-sm text-ink-3 tabular">3</span>
              <span>
                Tap <span className="font-medium">Add</span>.
              </span>
            </li>
          </ol>
          <div className="mt-6 flex justify-end">
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
