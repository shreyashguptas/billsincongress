'use client';

import * as React from 'react';
import { ConvexError } from 'convex/values';
import { Camera, ImageUp, RotateCcw, Trash2 } from 'lucide-react';

import { analytics } from '@/lib/analytics';
import { INPUT_MAX_BYTES, loadWorkingImage, renderAvatar, UnreadableImageError } from '@/lib/avatar-image';
import { cn } from '@/lib/utils';
import { AvatarMark } from '@/components/brand/pro-mark';
import { Alert } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AvatarEditor } from './avatar-editor';

export type AvatarSource = 'upload' | 'google' | null;

/** The three things the avatar can ask of Convex; `app/account/page.tsx` supplies them. */
export interface AvatarActions {
  /** Upload the finished photo and attach it. Throws `AvatarStepError`. */
  upload: (photo: Blob) => Promise<void>;
  remove: () => Promise<void>;
  restoreGooglePicture: () => Promise<void>;
}

/** Which step of a save failed, and our code for why. Never the file itself. */
export class AvatarStepError extends Error {
  constructor(
    readonly stage: 'upload' | 'save',
    readonly reason: string,
  ) {
    super(reason);
  }
}

/** Our code for a Convex error: the string a mutation threw, or RATE_LIMITED. */
export function convexReason(err: unknown): string {
  if (err instanceof ConvexError) {
    if (typeof err.data === 'string') return err.data;
    if (err.data && typeof err.data === 'object' && 'kind' in err.data && err.data.kind === 'RateLimited') {
      return 'RATE_LIMITED';
    }
  }
  return 'OTHER';
}

const MESSAGES: Record<string, string> = {
  UNREADABLE_IMAGE: 'That file could not be opened as a photo. Try a JPG, PNG or WebP.',
  TOO_LARGE: 'That file is over 50 MB. Try a smaller photo.',
  RATE_LIMITED: 'Too many uploads this hour. Try again later.',
  AVATAR_INVALID: 'That photo could not be saved. Try another one.',
};
const FALLBACK_MESSAGE = 'Your photo could not be uploaded. Check your connection and try again.';

/**
 * The reader's avatar on the account page, and the way to change it. Hover (or
 * the camera badge, on a phone) says what a click does. With no photo, a
 * click opens the device's own photo picker; with one, a small menu offers a
 * new photo, the Google picture back, or initials.
 */
export function AvatarButton({
  initials,
  src,
  source,
  hasGooglePicture,
  pro,
  actions,
}: {
  initials: string;
  src: string | null;
  source: AvatarSource;
  hasGooglePicture: boolean;
  pro: boolean;
  actions: AvatarActions;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [work, setWork] = React.useState<HTMLCanvasElement | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [editorError, setEditorError] = React.useState<string | null>(null);
  // Errors from before the editor opens (an unreadable file) or from the menu.
  const [pageError, setPageError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // A photo that failed to load (an expired Google link) shows initials, so the
  // control treats it as no photo: hover says "Upload", a click opens the picker.
  const [brokenSrc, setBrokenSrc] = React.useState<string | null>(null);
  const hasPhoto = src !== null && src !== brokenSrc;
  const offerGoogle = hasGooglePicture && source !== 'google';

  function pick() {
    inputRef.current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so picking the same file again still fires `change`.
    e.target.value = '';
    if (!file) return;
    setPageError(null);
    setEditorError(null);
    if (file.size > INPUT_MAX_BYTES) {
      analytics.avatarFailed({ stage: 'read', reason: 'TOO_LARGE' });
      showError(MESSAGES.TOO_LARGE);
      return;
    }
    try {
      const canvas = await loadWorkingImage(file);
      setWork(canvas);
      analytics.avatarEditorOpened({
        file_type: file.type || 'unknown',
        file_kb: Math.round(file.size / 1024),
        had_photo: hasPhoto,
      });
    } catch (err) {
      const reason = err instanceof UnreadableImageError ? 'UNREADABLE_IMAGE' : 'OTHER';
      analytics.avatarFailed({ stage: 'read', reason });
      showError(MESSAGES[reason] ?? FALLBACK_MESSAGE);
    }
  }

  // Inside the editor when it is open (choosing another photo), else under the avatar.
  function showError(message: string) {
    if (work) setEditorError(message);
    else setPageError(message);
  }

  async function onSave(frame: Parameters<React.ComponentProps<typeof AvatarEditor>['onSave']>[0]) {
    if (!work) return;
    setSaving(true);
    setEditorError(null);
    const started = performance.now();
    try {
      const photo = await renderAvatar(work, frame.viewport, frame.zoom, frame.offset);
      await actions.upload(photo);
      analytics.avatarSaved({
        format: photo.type === 'image/webp' ? 'webp' : 'jpeg',
        output_kb: Math.round(photo.size / 1024),
        zoom: Math.round(frame.zoom * 100) / 100,
        replaced: source ?? 'none',
        duration_ms: Math.round(performance.now() - started),
      });
      setWork(null);
    } catch (err) {
      const stage = err instanceof AvatarStepError ? err.stage : 'upload';
      const reason = err instanceof AvatarStepError ? err.reason : 'ENCODE_FAILED';
      analytics.avatarFailed({ stage, reason });
      setEditorError(MESSAGES[reason] ?? FALLBACK_MESSAGE);
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    analytics.avatarEditorCancelled();
    setWork(null);
    setEditorError(null);
  }

  async function run(action: () => Promise<void>, after: () => void) {
    setBusy(true);
    setPageError(null);
    try {
      await action();
      after();
    } catch {
      setPageError('That did not work. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const face = (
    <>
      <AvatarMark initials={initials} src={src} onPhotoError={setBrokenSrc} pro={pro} size="lg" />
      {/* Hover and keyboard focus say what a click does. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute flex flex-col items-center justify-center gap-1 rounded-full text-on-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
          // See-through over a photo; solid over initials, which would show through as clutter.
          hasPhoto ? 'bg-ink/70' : 'bg-ink',
          pro ? 'inset-[7px]' : 'inset-0',
        )}
      >
        <Camera className="h-5 w-5" strokeWidth={1.75} />
        <span className="text-[11px] font-medium">{hasPhoto ? 'Change' : 'Upload'}</span>
      </span>
      {/* Always visible, for touch screens that have no hover. */}
      <span
        aria-hidden="true"
        className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full border border-line-strong bg-raised text-ink sm:h-8 sm:w-8"
      >
        <Camera className="h-3.5 w-3.5" strokeWidth={1.75} />
      </span>
    </>
  );
  const trigger = 'focus-ring group relative shrink-0 self-start rounded-full disabled:opacity-60 sm:self-center';

  return (
    <div className="flex shrink-0 flex-col gap-2 self-start sm:self-center">
      <input
        ref={inputRef}
        type="file"
        // Any image the device offers; iOS converts HEIC to JPEG on the way in.
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={onFile}
      />
      {hasPhoto || offerGoogle ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={trigger} disabled={busy} aria-label="Change profile photo">
              {face}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onSelect={pick} className="cursor-pointer">
              <ImageUp className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              Upload a photo
            </DropdownMenuItem>
            {offerGoogle && (
              <DropdownMenuItem
                onSelect={() => run(actions.restoreGooglePicture, () => analytics.avatarGooglePictureRestored())}
                className="cursor-pointer"
              >
                <RotateCcw className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Use Google photo
              </DropdownMenuItem>
            )}
            {source && hasPhoto && (
              <DropdownMenuItem
                onSelect={() => run(actions.remove, () => analytics.avatarRemoved(source))}
                className="cursor-pointer"
              >
                <Trash2 className="mr-2 h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                Remove photo
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <button type="button" className={trigger} disabled={busy} onClick={pick} aria-label="Upload a profile photo">
          {face}
        </button>
      )}
      {pageError && (
        <Alert variant="destructive" role="alert" className="max-w-[16rem] text-[13px]">
          {pageError}
        </Alert>
      )}
      <AvatarEditor
        work={work}
        saving={saving}
        error={editorError}
        onCancel={onCancel}
        onPickAnother={pick}
        onSave={onSave}
      />
    </div>
  );
}
