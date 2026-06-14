import posthog from 'posthog-js';

// Typed PostHog event helpers — the code counterpart of ANALYTICS.md.
//
// RULES (see ANALYTICS.md "The contract"):
//  - Every custom event the app sends lives here as a named helper.
//  - Components never call posthog.capture() with raw strings.
//  - Adding/removing a feature means adding/removing its helpers here AND
//    updating the registry table in ANALYTICS.md, in the same commit.
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
  // ── Identity ─────────────────────────────────────────────────────────────

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

  // ── Auth events ──────────────────────────────────────────────────────────

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
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(PENDING_GOOGLE_AUTH_KEY, intent);
  },

  /**
   * …and consume it after the user lands back authenticated. Fires
   * signup_completed or signin_completed based on whether the account is new.
   * Returns true if a pending Google auth was consumed.
   */
  consumePendingGoogleAuth(isFreshAccount: boolean): boolean {
    if (typeof window === 'undefined') return false;
    const pending = window.sessionStorage.getItem(PENDING_GOOGLE_AUTH_KEY);
    if (!pending) return false;
    window.sessionStorage.removeItem(PENDING_GOOGLE_AUTH_KEY);
    if (isFreshAccount) {
      analytics.signupCompleted('google');
    } else {
      analytics.signinCompleted('google');
    }
    return true;
  },

  // ── Dashboard (home page) ────────────────────────────────────────────────

  dashboardCongressSelected: (congress: number) =>
    capture('dashboard_congress_selected', { congress }),

  dashboardDrilldownClicked: (filterType: string, filterValue: string | number, congress: number) =>
    capture('dashboard_drilldown_clicked', {
      filter_type: filterType,
      filter_value: filterValue,
      congress,
    }),

  // ── Bills browse ─────────────────────────────────────────────────────────

  billsFiltersApplied: (props: {
    status: string;
    bill_type: string;
    congress: string;
    state: string;
    policy_area: string;
    introduced_date: string;
    last_action_date: string;
    title_query: string;
    bill_number: string;
    sponsor_count: number;
    active_filter_count: number;
  }) => capture('bills_filters_applied', props),

  billsFiltersCleared: () => capture('bills_filters_cleared'),

  billsLoadMoreClicked: (nextPage: number, loadedCount: number) =>
    capture('bills_load_more_clicked', { next_page: nextPage, loaded_count: loadedCount }),

  billsNoResults: (activeFilterCount: number, titleQuery: string) =>
    capture('bills_no_results', { active_filter_count: activeFilterCount, title_query: titleQuery }),

  billCardClicked: (props: {
    bill_id: string;
    bill_type: string;
    bill_number: string;
    congress: number;
    policy_area: string;
    progress_stage: number | string;
  }) => capture('bill_card_clicked', props),

  // ── Bill detail & AI chat ────────────────────────────────────────────────

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

  billChatQuestionSubmitted: (props: {
    bill_id: string;
    question: string;
    question_length: number;
    source: 'typed' | 'example';
    question_number: number;
    user_type: LimitKind;
  }) => capture('bill_chat_question_submitted', props),

  billChatAnswerReceived: (props: {
    bill_id: string;
    response_ms: number;
    answer_length: number;
  }) => capture('bill_chat_answer_received', props),

  billChatFailed: (billId: string, error: string) =>
    capture('bill_chat_failed', { bill_id: billId, error }),

  billChatRateLimited: (billId: string, kind: LimitKind, max: number) =>
    capture('bill_chat_rate_limited', { bill_id: billId, limit_kind: kind, max }),

  rateLimitSignupClicked: (kind: LimitKind) =>
    capture('rate_limit_signup_clicked', { limit_kind: kind }),

  rateLimitSigninClicked: (kind: LimitKind) =>
    capture('rate_limit_signin_clicked', { limit_kind: kind }),

  // ── Podcast cross-promotion ──────────────────────────────────────────────

  podcastPromoClicked: (props: {
    placement: 'home' | 'learn' | 'bill';
    platform: 'spotify' | 'apple';
    bill_id?: string;
  }) => capture('podcast_promo_clicked', props),

  // ── Learn page (interactive civics guide) ────────────────────────────────

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
