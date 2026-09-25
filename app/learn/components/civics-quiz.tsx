'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';

// "Think you've got it?" — a five-question civics quiz with instant feedback
// and a congressional rank for a score. Feedback is never colour alone: the
// right answer is status-law green with a check and the word "Correct"; a
// wrong pick is the error colour with an X and the words "Your answer".

const QUESTIONS = [
  {
    question: 'How many people serve in Congress — House and Senate combined?',
    options: ['100', '270', '435', '535'],
    answer: 3,
    explanation: '435 Representatives plus 100 Senators makes 535 voting members.',
  },
  {
    question: 'How many Senators does each state get?',
    options: [
      'One',
      'Two — no matter the size',
      'It depends on population',
      'Ten',
    ],
    answer: 1,
    explanation:
      "Every state gets exactly two. California's 39 million people and Wyoming's 580,000 get the same two seats.",
  },
  {
    question: 'Where do most bills "die"?',
    options: [
      "On the President's desk",
      'On the chamber floor',
      'In committee',
      'In the Supreme Court',
    ],
    answer: 2,
    explanation:
      'About 9 in 10 bills never make it out of committee — they simply never get a vote.',
  },
  {
    question: 'The President vetoes a bill. Is it dead?',
    options: [
      'Yes, always',
      'Not necessarily — Congress can override the veto',
      'Only the courts can revive it',
      'It becomes law anyway',
    ],
    answer: 1,
    explanation:
      'If two-thirds of both chambers vote yes again, the bill becomes law over the veto.',
  },
  {
    question: 'Out of every 100 bills introduced, about how many become law?',
    options: ['Nearly all of them', 'About 50', 'About 25', 'About 3'],
    answer: 3,
    explanation: 'Only about 3 in 100. The journey is designed to be hard.',
  },
];

const RANKS: { min: number; title: string; note: string }[] = [
  { min: 5, title: 'Speaker of the House', note: 'Flawless. You could run the place.' },
  { min: 4, title: 'Committee Chair', note: 'A strong command of the process.' },
  { min: 3, title: 'Junior Senator', note: 'A solid foundation — one more read and you have it.' },
  { min: 2, title: 'Freshman Representative', note: 'You know the basics. Keep going.' },
  { min: 0, title: 'Campaign Volunteer', note: 'Scroll back up and walk the journey again — the dome will wait.' },
];

export function CivicsQuiz() {
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);

  const current = QUESTIONS[questionIndex];
  const isCorrect = selected !== null && selected === current.answer;

  const choose = (optionIndex: number) => {
    if (selected !== null) return;
    setSelected(optionIndex);
    const correct = optionIndex === current.answer;
    if (correct) setScore((s) => s + 1);
    analytics.learnQuizAnswered(questionIndex + 1, correct);
  };

  const next = () => {
    if (questionIndex === QUESTIONS.length - 1) {
      setFinished(true);
      analytics.learnQuizCompleted(score, QUESTIONS.length);
    } else {
      setQuestionIndex((i) => i + 1);
      setSelected(null);
    }
  };

  const restart = () => {
    setQuestionIndex(0);
    setSelected(null);
    setScore(0);
    setFinished(false);
    analytics.learnQuizRestarted();
  };

  const rank = RANKS.find((r) => score >= r.min) ?? RANKS[RANKS.length - 1];

  return (
    <div className="rounded-md border border-line bg-raised">
      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          // Results
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="p-8 text-center sm:p-12"
          >
            <p className="label-eyebrow">Your result</p>
            <p className="mt-4 font-serif text-display-lg font-medium text-ink tabular sm:text-display-xl">
              {score}/{QUESTIONS.length}
            </p>
            <p className="mt-2 font-serif text-display-sm font-medium text-ink">{rank.title}</p>
            <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-2 sm:text-base">
              {rank.note}
            </p>
            <Button type="button" variant="outline" onClick={restart} className="mt-8">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Take it again
            </Button>
          </motion.div>
        ) : (
          // Question
          <motion.div
            key={questionIndex}
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="p-6 sm:p-10"
          >
            {/* Progress segments */}
            <div className="mb-6 flex items-center justify-between gap-4">
              <p className="label-eyebrow tabular">
                Question {questionIndex + 1} of {QUESTIONS.length}
              </p>
              <div className="flex gap-1" aria-hidden="true">
                {QUESTIONS.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 w-5 rounded-xs transition-colors',
                      i <= questionIndex ? 'bg-ink' : 'bg-line',
                    )}
                  />
                ))}
              </div>
            </div>

            <h3 className="mb-6 text-display-sm text-ink">{current.question}</h3>

            <div className="space-y-2.5" role="group" aria-label="Answer choices">
              {current.options.map((option, i) => {
                const chosen = selected === i;
                const correctOption = i === current.answer;
                const showState = selected !== null;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => choose(i)}
                    disabled={selected !== null}
                    className={cn(
                      'focus-ring flex min-h-[3rem] w-full items-center justify-between gap-3 rounded-md border bg-raised px-4 py-3 text-left text-[15px] text-ink transition-colors duration-300 sm:text-base',
                      !showState && 'cursor-pointer border-line-strong hover:border-ink hover:bg-sunken',
                      showState && correctOption && 'border-status-law',
                      showState && chosen && correctOption && 'ring-1 ring-inset ring-status-law',
                      showState && chosen && !correctOption && 'border-error ring-1 ring-inset ring-error',
                      showState && !chosen && !correctOption && 'border-line text-ink-3',
                    )}
                  >
                    <span>{option}</span>
                    {showState && correctOption && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-status-law">
                        <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                        Correct{chosen ? '' : ' answer'}
                      </span>
                    )}
                    {showState && chosen && !correctOption && (
                      <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-error">
                        <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                        Your answer<span className="sr-only">, incorrect</span>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Feedback + next */}
            <AnimatePresence>
              {selected !== null && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.35 }}
                  className="overflow-hidden"
                >
                  <div className="mt-6 flex flex-col justify-between gap-4 border-t border-line pt-5 sm:flex-row sm:items-center">
                    <p className="text-[15px] leading-relaxed text-ink-2">
                      <span className={cn('font-semibold', isCorrect ? 'text-status-law' : 'text-error')}>
                        {isCorrect ? 'Correct. ' : 'Not quite. '}
                      </span>
                      {current.explanation}
                    </p>
                    <Button type="button" onClick={next} className="shrink-0">
                      {questionIndex === QUESTIONS.length - 1 ? 'See my result' : 'Next question'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
