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

/**
 * Where a filter change came from. `rail` is a pill in the always-visible row,
 * `panel` the "all filters" surface, `scope` the Congress switcher, and
 * `empty_state` the chip row shown when a filter set matches nothing.
 */
export type FilterSurface = 'rail' | 'panel' | 'scope' | 'empty_state';

/** How a bill's link left the page: the system share sheet, or the clipboard. */
export type ShareMethod = 'native' | 'copy';
/** `shared`/`cancelled` come from the share sheet, `copied`/`failed` from the clipboard. */
export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

/** How the page is being shown: in the browser, or as the installed app. */
export type DisplayMode = 'browser' | 'standalone';

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
   * Report an exception an error boundary caught. A React error boundary
   * (`app/error.tsx`, `app/global-error.tsx`) stops the error before PostHog's
   * window-level capture sees it, so without this call these render failures
   * would vanish from error tracking. Produces a `$exception` event, so
   * `before_send` in `instrumentation-client.ts` still filters it.
   */
  captureException(error: unknown) {
    if (!ready()) return;
    posthog.captureException(error);
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

  /**
   * A signed-out reader clicked Sign in or Sign up in the header. Which one
   * they were offered depends on `known_device` — whether an account has been
   * signed in on this browser before (lib/auth-cta.ts) — so it rides along to
   * show whether that guess sends people to the right form.
   */
  headerAuthClicked: (cta: AuthIntent, knownDevice: boolean) =>
    capture('header_auth_clicked', { cta, known_device: knownDevice }),

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

  /** Reader focused one party in the hero chamber (hover, or keyboard focus on
   *  its legend entry). Once per party per page view, so a mouse sweeping the
   *  arc does not flood the project. */
  homeChamberPartyFocused: (party: 'D' | 'R' | 'I' | 'U', congress: number) =>
    capture('home_chamber_party_focused', { party, congress }),

  /** Reader pinned a slice of the topic wheel by clicking it or its legend row.
   *  `is_rest` is the grey "everything else" slice. */
  homeTopicSelected: (props: { policy_area: string; is_rest: boolean; congress: number }) =>
    capture('home_topic_selected', props),

  /** Reader switched the state map between total bills and bills per member. */
  homeStateMapMeasureChanged: (measure: 'total' | 'per_member', congress: number) =>
    capture('home_state_map_measure_changed', { measure, congress }),

  // Bills browse

  /** `surface` says where "clear all" was pressed from — the bar, the panel, or
   *  the empty-result state, which are three different admissions of defeat. */
  billsFiltersCleared: (props?: {
    active_filter_count?: number;
    surface?: 'bar' | 'panel' | 'empty_state';
  }) => capture('bills_filters_cleared', props ?? {}),

  /** The header's search field (lg and up). Length, not the text — the same
   *  rule as `bills_no_results`. An empty submit just opens /bills. */
  headerSearchSubmitted: (queryLength: number) =>
    capture('header_search_submitted', { query_length: queryLength }),

  billsLoadMoreClicked: (nextPage: number, loadedCount: number) =>
    capture('bills_load_more_clicked', { next_page: nextPage, loaded_count: loadedCount }),

  billsNoResults: (activeFilterCount: number, queryLength: number) =>
    capture('bills_no_results', {
      active_filter_count: activeFilterCount,
      // Length, not the text. What people search for is their business; how
      // long a query has to get before it dead-ends is ours.
      query_length: queryLength,
    }),

  /**
   * A filter moved off its default or changed value.
   *
   * This closes the gap Documentation/ANALYTICS.md has flagged since the Apply
   * button was removed: there has been no way to see WHICH filters people use,
   * only that they hit zero results. Fired from one chokepoint in
   * bills-client.tsx, so it cannot drift per control.
   *
   * `filter_value` is deliberately omitted for free text and for sponsors —
   * those carry a length and a count instead.
   */
  billsFilterApplied: (props: {
    filter_kind: string;
    filter_value?: string;
    query_length?: number;
    sponsor_count?: number;
    surface: FilterSurface;
    active_filter_count: number;
  }) => capture('bills_filter_applied', props),

  /** A filter returned to its default outside the empty-result state. */
  billsFilterRemoved: (props: {
    filter_kind: string;
    surface: FilterSurface;
    active_filter_count: number;
  }) => capture('bills_filter_removed', props),

  /**
   * A picker opened. `layout` is the payoff property of the filter redesign: it
   * is the only way to learn whether the pointer test picks the right surface
   * for this audience. Cross-tab it against panel_closed.changes_made.
   */
  billsFilterPanelOpened: (props: {
    filter_kind: string;
    layout: 'sheet' | 'popover';
    active_filter_count: number;
  }) => capture('bills_filter_panel_opened', props),

  /** `dwell_ms` by filter_kind says whether hiding a filter cost anything. */
  billsFilterPanelClosed: (props: {
    filter_kind: string;
    layout: 'sheet' | 'popover';
    changes_made: number;
    dwell_ms: number;
    active_filter_count: number;
  }) => capture('bills_filter_panel_closed', props),

  /** In-picker search settled. Says whether long lists needed to be searchable. */
  billsFilterSearchUsed: (props: {
    filter_kind: string;
    query_length: number;
    result_count: number;
    selected: boolean;
  }) => capture('bills_filter_search_used', props),

  /**
   * A results list was a sample rather than the whole set — the backend's scan
   * gave up before filling the page. Reported by `list` itself rather than
   * inferred from the filters, so this fires when it actually happened and not
   * when it looked likely. Passive, once per filter set.
   */
  billsResultsTruncated: (props: {
    filter_kinds: string[];
    shown: number;
    known_total: number | null;
  }) => capture('bills_results_truncated', props),

  /** The Congress being browsed was switched on /bills. */
  billsCongressScopeChanged: (props: {
    congress: string;
    active_filter_count: number;
  }) => capture('bills_congress_scope_changed', props),

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

  /**
   * A link from one hub to a sibling hub, or from /bills into a hub.
   *
   * `placement` distinguishes the browse disclosure on /bills from the
   * sibling row on a hub page and from a picker footer. Worth having: this
   * event had no call site on /bills at all, so "no one uses the category
   * list" was unfalsifiable from our own data.
   */
  hubLinkClicked: (props: {
    from_path: string;
    to_path: string;
    hub_kind: 'chamber' | 'status' | 'topic';
    placement?: 'directory' | 'filter_panel' | 'hub_siblings';
  }) => capture('hub_link_clicked', props),

  /**
   * Instant bill suggestions under the home ask box settled on a result set.
   * Passive, once per settled query (debounced), including zero results — the
   * zero rows are the searches the title index cannot serve. Query text is not
   * sent; its length and how it was matched are.
   */
  billSuggestionsShown: (props: {
    match_kind: 'number' | 'acronym' | 'title';
    query_length: number;
    result_count: number;
    congress: number;
  }) => capture('bill_suggestions_shown', props),

  /** A suggested bill was opened, by click/tap or by Enter on a highlighted row. */
  billSuggestionClicked: (props: {
    bill_id: string;
    position: number;
    method: 'click' | 'enter';
    match_kind: 'number' | 'acronym' | 'title';
    query_length: number;
  }) => capture('bill_suggestion_clicked', props),

  /** "See all matching bills" under the suggestions, which opens /bills filtered by the query. */
  billSuggestionsSeeAllClicked: (props: {
    match_kind: 'number' | 'acronym' | 'title';
    query_length: number;
    result_count: number;
  }) => capture('bill_suggestions_see_all_clicked', props),

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

  /**
   * Reader pressed Share on a bill page. One event per press, whatever came of
   * it: `outcome` says whether the link went out. A `cancelled` share sheet is
   * a reader who looked and changed their mind, not an error.
   */
  billShareClicked: (props: {
    bill_id: string;
    method: ShareMethod;
    outcome: ShareOutcome;
    bill_type: string;
    bill_number: string;
    congress: number;
    policy_area: string;
    progress_stage: number | string;
  }) => capture('bill_share_clicked', props),

  // Installed app (PWA)

  /**
   * Tag every later event with how the site is being shown, so installed-app
   * use can be told apart from the browser without an event of its own. A
   * super property: it rides on every capture from this page load onwards.
   */
  registerDisplayMode(mode: DisplayMode) {
    if (!ready()) return;
    posthog.register({ display_mode: mode });
  },

  /**
   * Reader pressed "Install the app" in the footer. `browser_prompt` is the
   * browser's own install dialog (Chrome, Edge, Android), with the reader's
   * answer; `ios_instructions` is the how-to dialog shown on iPhone and iPad,
   * where Safari has no prompt to call.
   */
  appInstallClicked: (props:
    | { method: 'browser_prompt'; outcome: 'accepted' | 'dismissed' }
    | { method: 'ios_instructions' }) => capture('app_install_clicked', props),

  /**
   * The browser reports the site was installed (`appinstalled`), from our
   * button or its own install UI. Chromium only: Safari sends no such signal.
   */
  appInstalled: () => capture('app_installed'),

  // Pro plan: bill alerts + higher question allowance

  /**
   * A reader followed or unfollowed a bill for email alerts. From the bill page
   * the bill's properties ride along; the account page's Unfollow sends only
   * the id (it doesn't hold them).
   */
  billAlertToggled: (props: {
    bill_id: string;
    action: 'followed' | 'unfollowed';
    surface: 'bill_page' | 'account';
    bill_type?: string;
    bill_number?: string;
    congress?: number;
    policy_area?: string;
    progress_stage?: number | string;
  }) => capture('bill_alert_toggled', props),

  /**
   * A reader who is not on Pro pressed "Email me updates" and was shown the
   * upgrade prompt — the alert-as-upgrade-driver moment. `signed_in: false`
   * readers are sent to sign in first.
   */
  billAlertUpsellShown: (props: { bill_id: string; signed_in: boolean }) =>
    capture('bill_alert_upsell_shown', props),

  /** Reader pressed a subscribe button; they are about to leave for Stripe. */
  proCheckoutStarted: (props: {
    interval: 'month' | 'year';
    surface: 'pro_page' | 'account' | 'alert_prompt' | 'rate_limit';
  }) => capture('pro_checkout_started', props),

  /** Checkout could not be opened. `reason` is our error code, never card data. */
  proCheckoutFailed: (props: { interval: 'month' | 'year'; reason: string }) =>
    capture('pro_checkout_failed', props),

  /** Reader came back from Stripe Checkout (success page or cancel link). */
  proCheckoutReturned: (outcome: 'success' | 'canceled') =>
    capture('pro_checkout_returned', { outcome }),

  /**
   * The account page saw the plan turn Pro after a successful checkout — i.e.
   * the Stripe webhook landed. The end of the upgrade funnel.
   */
  proActivated: (interval: 'month' | 'year' | 'unknown') =>
    capture('pro_activated', { interval }),

  /**
   * A reader pressed one of the next steps in the "Welcome to Pro" dialog the
   * account page shows once, after a successful checkout turns the plan Pro.
   */
  proWelcomeStepClicked: (step: 'follow_bill' | 'ask') =>
    capture('pro_welcome_step_clicked', { step }),

  /** Reader opened the Stripe billing portal (change card, switch, cancel). */
  billingPortalOpened: () => capture('billing_portal_opened'),

  /** Reader used the link in an alert email to stop all alert emails. */
  billAlertsUnsubscribed: (props: { removed: number }) =>
    capture('bill_alerts_unsubscribed', props),

  // Grounded answers
  //
  // `surface` says where the question was asked from, so one funnel covers every
  // place the answer thread is mounted. `surfaceFor()` — now in lib/page-context.ts,
  // where it is unit-tested — emits exactly four values: 'home', 'bill', 'filtered'
  // and 'other'. A fifth, 'panel', is passed literally by the two click events
  // fired from inside the panel ('answer_source_clicked', 'answer_entity_clicked'),
  // which describe a place rather than a page. There is no 'list' surface; it was
  // in an early draft and never shipped.

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
    /**
     * The assistant asked the reader a clarifying question instead of answering.
     * A healthy small number; a rising one means questions are arriving
     * ambiguous, or the assistant is dodging.
     */
    asked_reader: boolean;
    /**
     * The answer hit the token ceiling mid-sentence. Previously undetectable,
     * and it systematically ate the closing caveat.
     */
    truncated_by_length: boolean;
  }) => capture('answer_received', props),

  /**
   * A question got no answer. `error` is a durable, specific reason, not one
   * opaque bucket:
   *   'connection_failed' — the request never delivered a byte.
   *   'stream_dropped'    — the connection was cut mid-answer. The fingerprint
   *                         of an idle timeout reaping a long, silent
   *                         generation; a rising rate here means the keep-alive
   *                         in app/api/answer/route.ts is losing.
   *   'no_stream_body'    — a response with no readable body.
   *   'stream_incomplete' — the stream ended with no done/error/rate-limit frame.
   *   'stalled_no_progress' — the reader saw nothing new for the stall window
   *                         and the client gave up. Distinct from
   *                         'stream_dropped' on purpose: nothing was cut, WE
   *                         stopped waiting, so folding the two together would
   *                         inflate the number that measures the keep-alive.
   *   any other string    — the server's own error message.
   * `stream_started` says whether any byte arrived before the failure and
   * `elapsed_ms` how long the reader waited — together they separate "never
   * connected" from "dropped after N seconds".
   */
  answerFailed: (props: {
    surface: string;
    error: string;
    elapsed_ms?: number;
    stream_started?: boolean;
  }) => capture('answer_failed', props),

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

  /**
   * `has_conversation: false` is the number the always-available launcher was
   * added for. It was impossible before: the old pill only appeared once a
   * conversation already existed, so a cold open could not be recorded.
   */
  answerPanelOpened: (props: {
    surface: string;
    trigger: 'launcher' | 'bill_page' | 'hero' | 'starter' | 'ask' | 'manual';
    has_conversation: boolean;
  }) => capture('answer_panel_opened', props),

  answerPanelClosed: (props: {
    surface: string;
    reason: 'manual' | 'escape' | 'swipe' | 'entity_navigation' | 'navigation';
    turn_count: number;
    dwell_ms: number;
  }) => capture('answer_panel_closed', props),

  /**
   * The other half of the mobile fix. `entity_navigation` closes should track
   * `answer_entity_clicked` on small viewports, and each one should be followed
   * by a restore — a gap between the two means readers are tapping bills and
   * not finding their way back to the conversation.
   */
  answerPanelRestored: (props: {
    surface: string;
    trigger: 'launcher';
    turn_count: number;
    away_ms: number;
  }) => capture('answer_panel_restored', props),

  /**
   * Drag end only, debounced — a capture per pointermove would swamp every
   * other event on the site. `width_pct` is the readable one: raw pixels are
   * not comparable between a 1440 and a 3840 display.
   */
  answerPanelResized: (props: {
    surface: string;
    width_px: number;
    width_pct: number;
    viewport_width: number;
    method: 'drag' | 'keyboard' | 'reset';
  }) => capture('answer_panel_resized', props),

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

  /**
   * A generated starter or chart question was used. On the home masthead the
   * data starters open a page instead of asking (`action: 'open_page'`, with the
   * `destination` path); only there is `action` sent. Kept on this event rather
   * than a new one so starter click-through stays one continuous series.
   */
  answerStarterClicked: (props: {
    surface: string;
    starter_text: string;
    action?: 'ask' | 'open_page';
    destination?: string;
  }) => capture('answer_starter_clicked', props),

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

  /** A signed-in free reader at the daily cap clicked through to Pro. */
  rateLimitUpgradeClicked: () => capture('rate_limit_upgrade_clicked'),

  // Podcast cross-promotion

  podcastPromoClicked: (props: {
    placement: 'home' | 'learn' | 'bill';
    platform: 'spotify' | 'apple';
    bill_id?: string;
  }) => capture('podcast_promo_clicked', props),

  // Learn page (the picture guide). Its only interaction is the state picker.

  /** User picked their state in the "two rooms" seat pictures. */
  learnStateSelected: (state: string, representatives: number) =>
    capture('learn_state_selected', { state, representatives }),
};
