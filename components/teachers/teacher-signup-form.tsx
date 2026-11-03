'use client';

import * as React from 'react';
import { useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { CircleCheck } from 'lucide-react';
import { api } from '@/convex/_generated/api';
import { analytics } from '@/lib/analytics';
import { billingErrorCode } from '@/lib/pro';
import { safeSessionStorage } from '@/lib/safe-storage';
import {
  SCHOOL_MAX_LENGTH,
  STUDENT_BANDS,
  TEACHER_LEVELS,
  TEACHER_PRICE_USD_YEAR,
  TEACHER_WANTS,
  WOULD_PAY,
  isPlausibleEmail,
  normalizeEmail,
  schoolSiteFor,
  signupSourceFrom,
  type SchoolSite,
  type StudentBand,
  type TeacherLevel,
  type TeacherWant,
  type WouldPay,
} from '@/lib/teachers';
import { FormError } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

const FAILURE_COPY: Record<string, string> = {
  INVALID_EMAIL: 'That email address doesn’t look right. Check it and try again.',
  SCHOOL_REQUIRED: 'Add the name of your school.',
  RATE_LIMITED: 'We’ve had a lot of sign-ups today. Please try again tomorrow.',
};

// The same chip as the bill filters' choices (all-filters-panel.tsx): a
// line-strong outline that fills with ink when chosen.
const CHIP =
  'h-9 min-w-0 rounded-sm border border-line-strong bg-raised px-3 text-[13px] text-ink hover:bg-sunken hover:text-ink touchable:h-11 ' +
  'data-[state=on]:border-ink data-[state=on]:bg-ink data-[state=on]:text-on-ink ' +
  // A chosen chip stays ink under the pointer; the hover fill above would
  // otherwise turn it pale with pale text on it.
  'data-[state=on]:hover:bg-ink data-[state=on]:hover:text-on-ink';

/** One question: a label above its control. */
function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label id={`${id}-label`} htmlFor={id} className="text-ink">
        {label}
      </Label>
      {hint && <p className="-mt-1 text-xs text-ink-3">{hint}</p>}
      {children}
    </div>
  );
}

function Chips<T extends string>({
  id,
  options,
  value,
  onChange,
}: {
  id: string;
  options: readonly { value: T; label: string }[];
  value: T | '';
  onChange: (next: T) => void;
}) {
  return (
    <ToggleGroup
      id={id}
      type="single"
      value={value}
      // Radix reports '' when the chosen chip is pressed again; keep the choice.
      onValueChange={(next) => next && onChange(next as T)}
      aria-labelledby={`${id}-label`}
      className="flex-wrap justify-start gap-1.5"
    >
      {options.map((o) => (
        <ToggleGroupItem key={o.value} value={o.value} className={CHIP}>
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/**
 * The /teachers sign-up form. The answers go to Convex (`teacherSignups.submit`)
 * and nowhere else; the analytics event carries only the multiple-choice
 * answers. Typed text is masked in session replay by PostHog's defaults, and
 * the thank-you does not repeat the address.
 */
export function TeacherSignupForm() {
  const submit = useMutation(api.teacherSignups.submit);
  const [email, setEmail] = React.useState('');
  const [school, setSchool] = React.useState('');
  const [level, setLevel] = React.useState<TeacherLevel | ''>('');
  const [students, setStudents] = React.useState<StudentBand | ''>('');
  const [wants, setWants] = React.useState<TeacherWant[]>([]);
  const [wouldPay, setWouldPay] = React.useState<WouldPay | ''>('');
  const [error, setError] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    const tidyEmail = normalizeEmail(email);
    if (!isPlausibleEmail(tidyEmail)) return setError(FAILURE_COPY.INVALID_EMAIL);
    if (!school.trim()) return setError(FAILURE_COPY.SCHOOL_REQUIRED);
    if (school.trim().length > SCHOOL_MAX_LENGTH) {
      return setError(`Keep the school name to ${SCHOOL_MAX_LENGTH} characters.`);
    }
    if (!level) return setError('Choose what you teach.');
    if (!students) return setError('Choose about how many students you teach.');
    if (!wouldPay) return setError(`Tell us whether you’d pay $${TEACHER_PRICE_USD_YEAR} a year.`);
    setError('');
    setSending(true);

    const source = signupSourceFrom(new URLSearchParams(window.location.search).get('from'));
    const stored = safeSessionStorage.getItem('bic_school_site');
    const schoolSite: SchoolSite | null = schoolSiteFor(document.referrer) ?? (stored as SchoolSite | null);
    try {
      const { isNew } = await submit({
        email: tidyEmail,
        school,
        level,
        students,
        wants,
        wouldPay,
        source,
        ...(schoolSite ? { schoolSite } : {}),
      });
      analytics.teacherSignupSubmitted({
        level,
        students,
        wants,
        would_pay: wouldPay,
        source,
        school_site: schoolSite,
        is_new: isNew,
      });
      setSent(true);
    } catch (err) {
      const code = err instanceof ConvexError ? billingErrorCode(err.data) : 'UNKNOWN';
      analytics.teacherSignupFailed({ reason: code });
      setError(FAILURE_COPY[code] ?? 'Your answers didn’t send. Please try again.');
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div role="status" className="flex items-start gap-3 rounded-lg border border-line bg-raised p-5">
        <CircleCheck className="mt-0.5 h-5 w-5 shrink-0 text-ink" strokeWidth={1.75} aria-hidden="true" />
        <div>
          <p className="font-medium text-ink">Thank you. You’re on the list.</p>
          <p className="mt-1 text-sm text-ink-2">
            We’ll email you before class tools open, and we may ask for 15 minutes of your time to hear what your
            class needs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6 rounded-lg border border-line bg-raised p-5 sm:p-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <Field id="teacher-email" label="School email">
          <Input
            id="teacher-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@school.org"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field id="teacher-school" label="School name">
          <Input
            id="teacher-school"
            autoComplete="organization"
            value={school}
            onChange={(e) => setSchool(e.target.value)}
          />
        </Field>
      </div>
      <Field id="teacher-level" label="You teach">
        <Chips id="teacher-level" options={TEACHER_LEVELS} value={level} onChange={setLevel} />
      </Field>
      <Field id="teacher-students" label="Students a year">
        <Chips id="teacher-students" options={STUDENT_BANDS} value={students} onChange={setStudents} />
      </Field>
      <Field id="teacher-wants" label="What would help most" hint="Pick any.">
        <ToggleGroup
          id="teacher-wants"
          type="multiple"
          value={wants}
          onValueChange={(next) => setWants(next as TeacherWant[])}
          aria-labelledby="teacher-wants-label"
          className="flex-wrap justify-start gap-1.5"
        >
          {TEACHER_WANTS.map((o) => (
            <ToggleGroupItem key={o.value} value={o.value} className={CHIP}>
              {o.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field id="teacher-pay" label={`Would you pay $${TEACHER_PRICE_USD_YEAR} a year for these tools?`}>
        <Chips id="teacher-pay" options={WOULD_PAY} value={wouldPay} onChange={setWouldPay} />
      </Field>
      {error && <FormError>{error}</FormError>}
      <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-ink-3 sm:max-w-[42ch]">
          For teachers, 18 and over. We use your email only to write to you about class tools, and delete it
          whenever you ask.
        </p>
        <Button type="submit" disabled={sending} className="shrink-0">
          {sending ? 'Sending…' : 'Get early access'}
        </Button>
      </div>
    </form>
  );
}
