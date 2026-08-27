'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, RotateCcw, X } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { cn } from '@/lib/utils';

// "Think you've got it?" — a five-question civics quiz with instant feedback
// and a congressional rank for a score.

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
    <div className="border border-border bg-card">
      <AnimatePresence mode="wait" initial={false}>
        {finished ? (
          // Results
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="p-8 sm:p-12 text-center"
          >
            <p className="label-eyebrow mb-4">Your result</p>
            <p className="font-serif text-display-lg sm:text-display-xl font-semibold tracking-tight tabular mb-2">
              {score}/{QUESTIONS.length}
            </p>
            <p className="font-serif text-xl sm:text-2xl font-semibold tracking-tight text-accent mb-2">
              {rank.title}
            </p>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed mb-8">
              {rank.note}
            </p>
            <button
              type="button"
              onClick={restart}
              className="inline-flex items-center gap-2 rounded-sm border border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Take it again
            </button>
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
            {/* Progress dots */}
            <div className="flex items-center justify-between mb-6">
              <p className="label-eyebrow">
                Question {questionIndex + 1} of {QUESTIONS.length}
              </p>
              <div className="flex gap-1.5" aria-hidden="true">
                {QUESTIONS.map((_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'h-1.5 w-5 rounded-full transition-colors',
                      i < questionIndex
                        ? 'bg-accent'
                        : i === questionIndex
                          ? 'bg-foreground'
                          : 'bg-border',
                    )}
                  />
                ))}
              </div>
            </div>

            <h3 className="font-serif text-xl sm:text-2xl font-semibold tracking-tight mb-6">
              {current.question}
            </h3>

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
                      'flex w-full items-center justify-between gap-3 rounded-sm border px-4 py-3.5 text-left text-sm sm:text-base transition-all duration-300',
                      !showState &&
                        'border-border bg-background hover:border-foreground/50 hover:bg-secondary cursor-pointer',
                      showState && correctOption && 'border-status-law bg-status-law/10 font-medium',
                      showState && chosen && !correctOption && 'border-accent bg-accent/10',
                      showState && !chosen && !correctOption && 'border-border opacity-50',
                    )}
                  >
                    <span>{option}</span>
                    {showState && correctOption && (
                      <Check className="h-5 w-5 shrink-0 text-status-law" aria-label="Correct answer" />
                    )}
                    {showState && chosen && !correctOption && (
                      <X className="h-5 w-5 shrink-0 text-accent" aria-label="Your incorrect answer" />
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
                  <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-border pt-5">
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      <span
                        className={cn(
                          'font-semibold',
                          isCorrect ? 'text-status-law' : 'text-accent',
                        )}
                      >
                        {isCorrect ? 'Correct. ' : 'Not quite. '}
                      </span>
                      {current.explanation}
                    </p>
                    <button
                      type="button"
                      onClick={next}
                      className="shrink-0 inline-flex items-center justify-center gap-2 rounded-sm bg-foreground px-5 py-2.5 text-sm font-medium text-background hover:bg-foreground/85 transition-colors"
                    >
                      {questionIndex === QUESTIONS.length - 1 ? 'See my result' : 'Next question'}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </button>
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
