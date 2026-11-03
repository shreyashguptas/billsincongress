'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, X } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { routeFor } from '@/lib/page-context';
import { safeLocalStorage, safeSessionStorage } from '@/lib/safe-storage';
import { bannerAllowedOn, schoolSiteFor, type SchoolSite } from '@/lib/teachers';
import { Button } from '@/components/ui/button';

/** The school platform this visit came from, remembered for the visit. */
const SCHOOL_SITE_KEY = 'bic_school_site';
/** Set when the reader closes the line; it never comes back on that browser. */
const DISMISSED_KEY = 'bic_teacher_banner_dismissed';
/** `teacher_banner_shown` is sent once a visit, not once a page. */
const SHOWN_KEY = 'bic_teacher_banner_shown';

const SCHOOL_SITES: readonly SchoolSite[] = ['google_classroom', 'canvas', 'teams', 'schoology'];

/**
 * The school platform this visit started from, or null. `document.referrer`
 * keeps the visit's first referrer through client-side navigation, but a full
 * reload replaces it with this site, so the first answer is kept for the visit.
 */
function schoolSiteThisVisit(): SchoolSite | null {
  const stored = safeSessionStorage.getItem(SCHOOL_SITE_KEY);
  if (stored && (SCHOOL_SITES as readonly string[]).includes(stored)) return stored as SchoolSite;
  const site = schoolSiteFor(document.referrer);
  if (site) safeSessionStorage.setItem(SCHOOL_SITE_KEY, site);
  return site;
}

/**
 * "Teaching with this?" — one quiet line under the header for visits that came
 * from Google Classroom, Canvas, Teams or Schoology, pointing to /teachers.
 * Students follow those links; the line asks them to pass it on, and catches
 * the teacher who checks the page they assigned. Not a pop-up: it moves
 * nothing, and closing it keeps it closed on that browser.
 *
 * Renders nothing on the server or for any other visit, so the cached page
 * every signed-out reader shares never carries it.
 */
export function TeacherBanner() {
  const pathname = usePathname();
  const [site, setSite] = React.useState<SchoolSite | null>(null);

  React.useEffect(() => {
    if (safeLocalStorage.getItem(DISMISSED_KEY)) return;
    setSite(schoolSiteThisVisit());
  }, []);

  const visible = site !== null && bannerAllowedOn(pathname);
  const route = routeFor(pathname);

  React.useEffect(() => {
    if (!visible || !site || safeSessionStorage.getItem(SHOWN_KEY)) return;
    safeSessionStorage.setItem(SHOWN_KEY, '1');
    analytics.teacherBannerShown({ route, school_site: site });
  }, [visible, site, route]);

  if (!visible || !site) return null;

  const dismiss = () => {
    safeLocalStorage.setItem(DISMISSED_KEY, '1');
    analytics.teacherBannerDismissed({ route, school_site: site });
    setSite(null);
  };

  return (
    <aside aria-label="For teachers" className="border-b border-line bg-sunken">
      <div className="container-editorial flex items-center gap-3 py-2">
        <p className="min-w-0 flex-1 text-sm text-ink-2">
          <span className="font-medium text-ink">Teaching with this?</span>{' '}
          Free class tools are coming. Tell us what your class needs.
        </p>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link
            href="/teachers?from=banner"
            onClick={() => analytics.teacherBannerClicked({ route, school_site: site })}
          >
            For teachers
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismiss} aria-label="Close">
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </Button>
      </div>
    </aside>
  );
}
