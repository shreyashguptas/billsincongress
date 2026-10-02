// The two PostHog surveys the site draws itself (type "api" in PostHog, so the
// SDK never renders them). Answers arrive in PostHog's Surveys tab as ordinary
// `survey sent` events, which is why the ids here must match PostHog exactly.
//
// Changing a question's wording: edit it in PostHog too, and keep its id —
// responses are keyed by question id, so a new id starts a new column.
// Documentation/ANALYTICS.md, "Feedback and surveys", lists both.

export interface SurveyQuestion {
  id: string;
  question: string;
}

export interface SurveyDefinition<Q extends string> {
  id: string;
  name: string;
  questions: Record<Q, SurveyQuestion>;
  /** Question order as PostHog stores it; the index is the legacy response key. */
  order: readonly Q[];
}

/** The header's Feedback button: Issue or Idea, the message, and an optional picture. */
export const FEEDBACK_SURVEY: SurveyDefinition<'kind' | 'message' | 'picture'> = {
  id: '01a0ee82-e9d6-0000-2be7-a3a3010e9529',
  name: 'Feedback',
  questions: {
    kind: { id: 'af6341fe-3440-43d6-aa88-62795b7530f0', question: 'What would you like to share?' },
    message: { id: '3148731c-b09d-43de-9f1a-5ec854fb786d', question: "What's on your mind?" },
    // A link to the picture, stored in Convex (convex/feedback.ts). Empty when none was added.
    picture: { id: 'ef351a57-2159-48c5-8ada-8213f892f0ee', question: 'Picture' },
  },
  order: ['kind', 'message', 'picture'],
};

/**
 * One question on a reader's third page, once per person. PostHog stops
 * returning it as active after 1,000 answers (its response limit), and the
 * prompt only shows while it is active, so that limit is the cap.
 */
export const FOUND_IT_SURVEY: SurveyDefinition<'found' | 'missing'> = {
  id: '01a0ee82-f301-0000-9572-4b5e0e2d5cd3',
  name: 'Did you find what you were looking for?',
  questions: {
    found: { id: '8202b037-2c15-4d55-965b-be7f3c4c45e4', question: 'Did you find what you were looking for?' },
    missing: { id: '24f4801a-1c4f-436b-aed2-59da1ea5306c', question: 'What was missing?' },
  },
  order: ['found', 'missing'],
};

export type FeedbackKind = 'Issue' | 'Idea';

/** Longest message either form accepts. */
export const FEEDBACK_MAX_LENGTH = 2000;
