'use client';

import * as React from 'react';
import { CircleCheck, ImagePlus, Lightbulb, TriangleAlert, X } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LengthLimitNote, useLengthLimit } from '@/components/brand/length-limit';
import { FEEDBACK_MAX_LENGTH, FEEDBACK_SURVEY, type FeedbackKind } from '@/lib/feedback/surveys';
import { MAX_INPUT_BYTES, preparePicture, uploadPicture } from '@/lib/feedback/picture';

type Step = 'pick' | 'write' | 'thanks';

interface Picture {
  blob: Blob;
  preview: string;
  name: string;
}

const KINDS: { kind: FeedbackKind; Icon: typeof TriangleAlert; hint: string; placeholder: string }[] = [
  { kind: 'Issue', Icon: TriangleAlert, hint: 'Something is wrong', placeholder: 'What went wrong?' },
  { kind: 'Idea', Icon: Lightbulb, hint: 'To make the site better', placeholder: 'My idea for Bills in Congress is…' },
];

/** How long the thank-you stays before the box closes itself. */
const THANKS_MS = 2500;

export const FEEDBACK_SURVEY_REF = { id: FEEDBACK_SURVEY.id, name: FEEDBACK_SURVEY.name };

/**
 * The inside of the Feedback box, shared by the header popover (md and up) and
 * the phone dialog: pick Issue or Idea, write it, optionally add a picture,
 * send, thanks. It knows nothing about how it is shown; `onSent` and `onDone`
 * tell the container what happened.
 *
 * The message goes to PostHog as a `survey sent` for the "Feedback" survey; a
 * picture goes to Convex first and rides along as a link. See lib/feedback/.
 */
export function FeedbackPanel({ onSent, onDone }: { onSent: () => void; onDone: () => void }) {
  const [step, setStep] = React.useState<Step>('pick');
  const [kind, setKind] = React.useState<FeedbackKind>('Issue');
  const [message, setMessage] = React.useState('');
  const limitId = React.useId();
  const { limit, nudging, onNudgeEnd } = useLengthLimit(FEEDBACK_MAX_LENGTH, 'feedback');
  const [picture, setPicture] = React.useState<Picture | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState('');
  const fileRef = React.useRef<HTMLInputElement>(null);
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  const canSend = React.useMemo(() => analytics.canSendSurveys(), []);

  // The preview is an object URL; let it go when the picture is replaced or the box closes.
  React.useEffect(() => () => { if (picture) URL.revokeObjectURL(picture.preview); }, [picture]);

  React.useEffect(() => {
    if (step !== 'thanks') return;
    const t = window.setTimeout(onDone, THANKS_MS);
    return () => window.clearTimeout(t);
  }, [step, onDone]);

  function choose(next: FeedbackKind) {
    setKind(next);
    setStep('write');
    // After the step renders; autoFocus alone misses when the popover animates in.
    requestAnimationFrame(() => textRef.current?.focus());
  }

  async function attach(file: File | Blob | null | undefined, name = 'picture') {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('That file isn’t a picture.');
      return;
    }
    if (file.size > MAX_INPUT_BYTES) {
      setError('That picture is too large. Try a screenshot instead.');
      return;
    }
    setPreparing(true);
    try {
      const blob = await preparePicture(file);
      setPicture({ blob, preview: URL.createObjectURL(blob), name });
    } catch {
      setError('That picture couldn’t be read. Try a PNG or JPEG.');
    } finally {
      setPreparing(false);
    }
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith('image/'));
    if (!file) return;
    // A pasted screenshot has no text to insert; keep any text that came with it.
    if (!e.clipboardData.getData('text')) e.preventDefault();
    void attach(file, file.name || 'Pasted picture');
  }

  async function send() {
    const text = message.trim();
    if (!text) {
      setError(kind === 'Issue' ? 'Say what went wrong first.' : 'Write your idea first.');
      textRef.current?.focus();
      return;
    }
    setError('');
    setSending(true);
    let pictureUrl: string | undefined;
    if (picture) {
      try {
        pictureUrl = await uploadPicture(picture.blob);
      } catch {
        setSending(false);
        setError('The picture didn’t upload. Try again, or remove it and send.');
        return;
      }
    }
    const q = FEEDBACK_SURVEY.questions;
    analytics.surveySent(FEEDBACK_SURVEY_REF, [
      { ...q.kind, response: kind },
      { ...q.message, response: text },
      { ...q.picture, response: pictureUrl },
    ]);
    setSending(false);
    onSent();
    setStep('thanks');
  }

  if (!canSend) {
    return (
      <p className="p-4 text-sm text-ink-2">
        Feedback can’t be sent from this browser right now. Email{' '}
        <a href="mailto:hi@billsincongress.com" className="link focus-ring rounded-xs">
          hi@billsincongress.com
        </a>{' '}
        instead.
      </p>
    );
  }

  if (step === 'thanks') {
    return (
      <div role="status" className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <CircleCheck className="h-6 w-6 text-ink" strokeWidth={1.75} aria-hidden="true" />
        <p className="text-[15px] font-medium text-ink">Thanks — we read every one.</p>
      </div>
    );
  }

  if (step === 'pick') {
    return (
      <div className="p-4">
        <p className="text-[15px] font-medium text-ink">What would you like to share?</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {KINDS.map(({ kind: k, Icon, hint }) => (
            <button
              key={k}
              type="button"
              onClick={() => choose(k)}
              className="focus-ring flex flex-col items-center gap-1.5 rounded-md border border-line-strong bg-raised px-2 py-5 text-center transition-colors hover:bg-sunken"
            >
              <Icon className="h-5 w-5 text-ink" strokeWidth={1.75} aria-hidden="true" />
              <span className="text-[15px] font-medium text-ink">{k}</span>
              <span className="text-[13px] leading-tight text-ink-3">{hint}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const current = KINDS.find((k) => k.kind === kind)!;
  const busy = sending || preparing;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <div className="p-4 pb-3">
        <label htmlFor="feedback-message" className="flex items-center gap-1.5 text-[13px] font-medium text-ink-2">
          <current.Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {kind}
        </label>
        <Textarea
          ref={textRef}
          id="feedback-message"
          value={message}
          onChange={(e) => {
            setMessage(limit(e, message));
            if (error) setError('');
          }}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={current.placeholder}
          rows={5}
          onAnimationEnd={onNudgeEnd}
          className={cn('mt-2 resize-none', nudging && 'animate-nudge')}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `feedback-error ${limitId}` : limitId}
        />
        <LengthLimitNote id={limitId} length={message.length} max={FEEDBACK_MAX_LENGTH} />

        {(picture || preparing) && (
          <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-raised p-1.5 pr-1">
            {picture ? (
              // A plain <img>: the preview is a local object URL, which next/image cannot optimise.
              <img src={picture.preview} alt="" className="h-9 w-9 shrink-0 rounded-sm border border-line object-cover" />
            ) : (
              <span className="h-9 w-9 shrink-0 animate-pulse rounded-sm bg-sunken" aria-hidden="true" />
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2">
              {picture ? picture.name : 'Adding picture…'}
            </span>
            {picture && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 touchable:h-9 touchable:w-9"
                onClick={() => setPicture(null)}
                aria-label="Remove picture"
                disabled={sending}
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </Button>
            )}
          </div>
        )}

        {error && (
          <p id="feedback-error" role="alert" className="mt-2 text-[13px] text-error">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep('pick')} disabled={sending}>
          Back
        </Button>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              void attach(file, file?.name);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            <ImagePlus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {picture ? 'Replace' : 'Picture'}
          </Button>
          <Button type="submit" size="sm" disabled={busy} className={cn(sending && 'cursor-wait')}>
            {sending ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </form>
  );
}
