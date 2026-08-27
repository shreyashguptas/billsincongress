import posthog from 'posthog-js';

import { safeSessionStorage } from '@/lib/safe-storage';

// Typed PostHog event helpers — the code counterpart of Documentation/ANALYTICS.md.
//
// RULES (see Documentation/ANALYTICS.md "The contract"):
//  - Every custom event the app sends lives here as a named helper.
//  - Components never call posthog.capture() with raw strings.
//  - Adding/removing a feature means adding/removing its helpers here AND
//    updating the registry table in Documentation/ANALYTICS.md, in the same commit.
//
// Every helper is safe to call anywhere: it no-ops during SSR and when
// PostHog isn't configured (missing env vars).

function ready(): boolean {
  return typeof window !== 'undefined' && posthog.__loaded;
}

function capture(event: string, properties?: Record<string, unknown>) {
  if (!ready()) return;
  posthog.capture(event, properties);
}

/** sessionStorage key used to attribute Google OAuth completions after the redirect. */
const PENDING_GOOGLE_AUTH_KEY = 'ph_pending_google_auth';

export type AuthIntent = 'sign_in' | 'sign_up';
export type LimitKind = 'anonymous' | 'authed';

export const analytics = {
  // Identity

  /** Tie all events (past anonymous + future) to the signed-in user. Idempotent. */
  identify(
    userId: string,
    props: {
      email?: string;
      name?: string;
      plan: string;
      email_verified: boolean;
    },
    accountCreatedAt: number,
  ) {
    if (!ready()) return;
    posthog.identify(userId, props, {
      account_created_at: new Date(accountCreatedAt).toISOString(),
    });
  },

  isIdentified(): boolean {
    if (!ready()) return false;
    return posthog._isIdentified();
  },

  /** Forget the current person (called on sign-out). */
  reset() {
    if (!ready()) return;
    posthog.reset();
  },

  /**
   * Headers that let server-side captures attach to the same person/session.
   * Spread into fetch() headers for API calls whose routes capture events.
   */
  requestHeaders(): Record<string, string> {
    if (!ready()) return {};
    return {
      'X-PostHog-Distinct-Id': posthog.get_distinct_id(),
      'X-PostHog-Session-Id': posthog.get_session_id(),
    };
  },

  // Auth events

  signupFormSubmitted: () => capture('signup_form_submitted', { method: 'password' }),
  signupVerificationSubmitted: () => capture('signup_verification_submitted'),
  signupVerificationCodeResent: () => capture('signup_verification_code_resent'),
  signupCompleted: (method: 'password' | 'google') => capture('signup_completed', { method }),
  signupFailed: (step: 'credentials' | 'verification', reason: string) =>
    capture('signup_failed', { step, reason }),

  signinSubmitted: () => capture('signin_submitted', { method: 'password' }),
  signinCompleted: (method: 'password' | 'google') => capture('signin_completed', { method }),
  signinFailed: (reason: 'invalid_credentials' | 'other') => capture('signin_failed', { reason }),

  authGoogleClicked: (intent: AuthIntent) => capture('auth_google_clicked', { intent }),

  signedOut: () => {
    capture('signed_out');
    // Forget the person so the next visitor on this device starts fresh.
    if (ready()) posthog.reset();
  },

  welcomeModalShown: () => capture('welcome_modal_shown'),

  /**
   * Google OAuth does a full-page redirect, so completion can't be captured in
   * the click handler. Mark the intent before redirecting…
   */
  markPendingGoogleAuth(intent: AuthIntent) {
    safeSessionStorage.setItem(PENDING_GOOGLE_AUTH_KEY, intent);
  },

  /**
   * …and consume it after the user lands back authenticated. Fires
   * signup_completed or signin_completed based on whether the account is new.
   * Returns true if a pending Google auth was consumed.
   */
  consumePendingGoogleAuth(isFreshAccount: boolean): boolean {
    const pending = safeSessionStorage.getItem(PENDING_GOOGLE_AUTH_KEY);
    if (!pending) return false;
    safeSessionStorage.removeItem(PENDING_GOOGLE_AUTH_KEY);
    if (isFreshAccount) {
      analytics.signupCompleted('google');
    } else {
      analytics.signinCompleted('google');
    }
    return true;
  },

  // Dashboard (home page)

  dashboardCongressSelected: (congress: number) =>
    capture('dashboard_congress_selected', { congress }),

  dashboardDrilldownClicked: (filterType: string, filterValue: string | number, congress: number) =>
    capture('dashboard_drilldown_clicked', {
      filter_type: filterType,
      filter_value: filterValue,
      congress,
    }),

  // Bills browse

  billsFiltersCleared: () => capture('bills_filters_cleared'),

  billsLoadMoreClicked: (nextPage: number, loadedCount: number) =>
    capture('bills_load_more_clicked', { next_page: nextPage, loaded_count: loadedCount }),

  billsNoResults: (activeFilterCount: number, titleQuery: string) =>
    capture('bills_no_results', { active_filter_count: activeFilterCount, title_query: titleQuery }),

  /**
   * A reader dropped one filter from the empty-result state's chip row. Tells us
   * whether the escape hatch out of a dead end is actually being used, and which
   * filter people blame first. `filterKind` is the filter's key, never its value.
   */
  billsNoResultsFilterRemoved: (filterKind: string, activeFilterCount: number) =>
    capture('bills_no_results_filter_removed', {
      filter_kind: filterKind,
      active_filter_count: activeFilterCount,
    }),

  billCardClicked: (props: {
    bill_id: string;
    bill_type: string;
    bill_number: string;
    congress: number;
    policy_area: string;
    progress_stage: number | string;
  }) => capture('bill_card_clicked', props),

  // Hub pages (topic / chamber / status browse pages)

  /**
   * A hub page was rendered. Passive, once per view. `bill_count` is the exact
   * total for that hub, or null when the backend could not answer exactly — a
   * hub that reports 0 is worth noticing, since an empty hub is the doorway
   * page the design set out to avoid.
   */
  hubViewed: (props: {
    hub_kind: 'chamber' | 'status' | 'topic';
    hub_path: string;
    bill_count: number | null;
    page: number;
  }) => capture('hub_viewed', props),

  /** A link from one hub to a sibling hub, or from /bills into a hub. */
  hubLinkClicked: (props: {
    from_path: string;
    to_path: string;
    hub_kind: 'chamber' | 'status' | 'topic';
  }) => capture('hub_link_clicked', props),

  // Bill detail & AI chat

  billViewed: (props: {
    bill_id: string;
    bill_type: string;
    bill_number: string;
    congress: number;
    policy_area: string;
    progress_stage: number | string;
    has_summary: boolean;
    has_pdf: boolean;
  }) => capture('bill_viewed', props),

  /**
   * Fired when the committee base-rate context line is shown on a bill detail
   * page (passive — once per bill view). Lets us see how often the stat appears
   * and the historical odds visitors are actually seeing.
   */
  billBaseRateViewed: (props: {
    bill_id: string;
    chamber: 'house' | 'senate';
    days_in_committee: number;
    base_rate_percent: number;
    base_rate_sample: number;
  }) => capture('bill_base_rate_viewed', props),

  billPdfOpened: (billId: string) => capture('bill_pdf_opened', { bill_id: billId }),

  billSaveToggled: (props: {
    bill_id: string;
    action: 'saved' | 'unsaved';
    bill_type: string;
    bill_number: string;
    congress: number;
    policy_area: string;
    progress_stage: number | string;
  }) => capture('bill_save_toggled', props),

  /** Signed-out user clicked Save — the save-as-signup-driver conversion moment. */
  billSaveSigninRedirected: (billId: string) =>
    capture('bill_save_signin_redirected', { bill_id: billId }),

  // Grounded answers
  //
  // `surface` says where the question was asked from ('bill', 'home', 'panel',
  // 'list'), so one funnel covers every place the answer thread is mounted.

  answerQuestionSubmitted: (props: {
    surface: string;
    question: string;
    question_length: number;
    source: 'typed' | 'starter';
    question_number: number;
    /** Present only when asked from a filtered list (spec §6.3). */
    scope_label?: string;
  }) => capture('answer_question_submitted', props),

  answerReceived: (props: {
    surface: string;
    response_ms: number;
    answer_length: number;
    db_source_count: number;
    web_source_count: number;
    dropped: number;
    partial: boolean;
  }) => capture('answer_received', props),

  answerFailed: (props: { surface: string; error: string }) =>
    capture('answer_failed', props),

  answerSourceClicked: (props: {
    surface: string;
    source_kind: 'db' | 'web';
    position: number;
  }) => capture('answer_source_clicked', props),

  /**
   * The grounding-health metric. A rising line means the model is citing rows
   * it was never given, and the fix is stronger `gotchas` in the catalog.
   */
  answerCitationUnresolved: (props: {
    surface: string;
    marker_count: number;
    model: string;
  }) => capture('answer_citation_unresolved', props),

  answerRateLimited: (props: {
    surface: string;
    limit_kind: LimitKind;
    max: number;
  }) => capture('answer_rate_limited', props),

  answerEntityClicked: (props: {
    surface: string;
    entity_kind: 'bill' | 'sponsor' | 'topic' | 'state';
    position: number;
    entity_id: string;
  }) => capture('answer_entity_clicked', props),

  answerPanelOpened: (props: { surface: string; trigger: string }) =>
    capture('answer_panel_opened', props),

  /**
   * Whether the persistent panel is earning its complexity: a reader who kept
   * asking after moving to a different page.
   */
  answerSurvivedNavigation: (props: {
    from_surface: string;
    to_surface: string;
    turn_number: number;
  }) => capture('answer_survived_navigation', props),

  answerHistoryOpened: (props: { chat_count: number }) =>
    capture('answer_history_opened', props),

  answerHistoryThreadResumed: (props: {
    thread_id: string;
    age_days: number;
    message_count: number;
  }) => capture('answer_history_thread_resumed', props),

  answerThreadDeleted: (props: { scope: 'one' | 'all'; thread_count: number }) =>
    capture('answer_thread_deleted', props),

  /** A conversation started signed-out, kept on request after signing in. */
  answerAnonThreadSaved: (props: { turn_count: number }) =>
    capture('answer_anon_thread_saved', props),

  answerStarterClicked: (props: { surface: string; starter_text: string }) =>
    capture('answer_starter_clicked', props),

  answerWebSearchUsed: (props: {
    surface: string;
    reason: string;
    result_count: number;
    engine: string;
  }) => capture('answer_web_search_used', props),

  rateLimitSignupClicked: (kind: LimitKind) =>
    capture('rate_limit_signup_clicked', { limit_kind: kind }),

  rateLimitSigninClicked: (kind: LimitKind) =>
    capture('rate_limit_signin_clicked', { limit_kind: kind }),

  // Podcast cross-promotion

  podcastPromoClicked: (props: {
    placement: 'home' | 'learn' | 'bill';
    platform: 'spotify' | 'apple';
    bill_id?: string;
  }) => capture('podcast_promo_clicked', props),

  // Learn page (interactive civics guide)

  /** User picked their state in the "two chambers" seat-chart explorer. */
  learnStateSelected: (state: string, representatives: number) =>
    capture('learn_state_selected', { state, representatives }),

  /** User navigated to a step of the interactive bill journey. */
  learnJourneyStepViewed: (step: number, stepTitle: string, method: 'next' | 'back' | 'jump') =>
    capture('learn_journey_step_viewed', { step, step_title: stepTitle, method }),

  /** User answered a civics-quiz question. */
  learnQuizAnswered: (question: number, correct: boolean) =>
    capture('learn_quiz_answered', { question, correct }),

  /** User finished the civics quiz. */
  learnQuizCompleted: (score: number, total: number) =>
    capture('learn_quiz_completed', { score, total }),

  /** User restarted the civics quiz from the results screen. */
  learnQuizRestarted: () => capture('learn_quiz_restarted'),
};
