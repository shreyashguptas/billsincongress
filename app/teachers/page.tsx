import Link from 'next/link';
import type { Metadata, Viewport } from 'next';
import { sharedViewport } from '../shared-metadata';
import { SectionHeader } from '@/components/brand/section';
import { TeacherSignupForm } from '@/components/teachers/teacher-signup-form';

export const viewport: Viewport = sharedViewport;

export const metadata: Metadata = {
  title: 'For teachers',
  description:
    'Bring real bills into your class. Bills in Congress is free for every student; class tools are coming. Tell us what your class needs.',
  alternates: { canonical: '/teachers' },
};

// The teacher sign-up test (documentation/overview.md, "Teacher sign-up test"):
// what class tools would do, and a form that asks whether teachers want them
// and would pay. Nothing on this page is built yet except the form, and the
// page says so: every tool is marked "Coming".
const TOOLS = [
  {
    title: 'Assign bills',
    body: 'Pick the bills for a lesson. Students join with one class code. No student emails or accounts.',
  },
  {
    title: 'See what the class asked',
    body: 'The questions your students asked about each bill, without their names.',
  },
  {
    title: 'See who opened each bill',
    body: 'How many students opened each bill you assigned.',
  },
];

export default function TeachersPage() {
  return (
    <article className="animate-fade-in">
      <header className="container-prose pb-10 pt-12 sm:pb-14 sm:pt-16">
        <p className="label-eyebrow">For teachers</p>
        <h1 className="mt-3 text-display-lg text-ink sm:text-display-xl">Bring real bills into your class.</h1>
        <p className="mt-5 max-w-[60ch] text-[1.0625rem] leading-relaxed text-ink-2 sm:text-lg">
          Students already use Bills in Congress for class, from Google Classroom, Canvas and Teams. Every bill,
          its plain-English summary and the{' '}
          <Link href="/learn" className="link">
            How Congress works
          </Link>{' '}
          guide are free, with no account. We want to build tools for teachers next. Help us decide which.
        </p>
      </header>

      <section className="container-prose">
        <div className="border-t border-line pb-12 pt-8 sm:pb-16">
          <SectionHeader eyebrow="Coming" title="Class tools we’re planning." />
          <ul className="mt-6 border-t border-line">
            {TOOLS.map((tool) => (
              <li key={tool.title} className="flex gap-4 border-b border-line py-4 sm:gap-6">
                <span className="w-16 shrink-0 pt-0.5 font-mono text-xs uppercase tracking-wider text-ink-2">
                  Coming
                </span>
                <div className="min-w-0">
                  <h3 className="text-title text-ink">{tool.title}</h3>
                  <p className="mt-1 text-base leading-relaxed text-ink-2">{tool.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="sign-up" className="container-prose scroll-mt-24">
        <div className="border-t border-line pb-16 pt-8 sm:pb-24">
          <SectionHeader eyebrow="Early access" title="Tell us about your class." />
          <p className="mb-6 mt-3 text-base text-ink-2">Six questions, about a minute.</p>
          <TeacherSignupForm />
        </div>
      </section>
    </article>
  );
}
