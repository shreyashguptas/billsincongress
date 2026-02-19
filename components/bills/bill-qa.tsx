'use client';

import { useState } from 'react';
import { billsService } from '@/lib/services/bills-service';
import ReactMarkdown from 'react-markdown';

interface BillQAProps {
  billId: string;
}

const EXAMPLE_QUESTIONS = [
  "What does this bill do in simple terms?",
  "What is the current status and what's next?",
  "Who supports or opposes this bill?",
  "What are the key sections of this bill?",
];

export default function BillQA({ billId }: BillQAProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;

    setIsLoading(true);
    setError('');
    setAnswer('');

    try {
      const result = await billsService.askBillQuestion(billId, question);
      if (result.error) {
        setError(result.error);
      } else {
        setAnswer(result.answer);
      }
    } catch (err) {
      setError('Failed to get response. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (example: string) => {
    setQuestion(example);
  };

  return (
    <div className="bg-card rounded-lg shadow-lg p-4 sm:p-6 mt-4">
      <h2 className="text-lg sm:text-xl font-semibold mb-4">Ask about this bill</h2>
      
      <form onSubmit={handleSubmit} className="mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a question about this bill..."
            className="flex-1 px-4 py-2 rounded-md border border-input bg-background text-sm sm:text-base focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !question.trim()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isLoading ? 'Thinking...' : 'Ask'}
          </button>
        </div>
      </form>

      <div className="mb-4">
        <p className="text-xs text-muted-foreground mb-2">Try asking:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_QUESTIONS.map((example, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(example)}
              disabled={isLoading}
              className="px-2 py-1 text-xs sm:text-sm bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              {example}
            </button>
          ))}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />
          <span className="text-sm">Analyzing bill and generating response...</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {answer && (
        <div className="mt-4 p-4 bg-muted/30 rounded-md">
          <h3 className="text-sm font-medium mb-2">Answer:</h3>
          <div className="prose prose-sm max-w-none text-sm sm:text-base leading-relaxed">
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="mb-2">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                em: ({ children }) => <em className="italic">{children}</em>,
                h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-semibold mt-3 mb-2">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
                a: ({ href, children }) => <a href={href} className="text-primary underline" target="_blank" rel="noopener noreferrer">{children}</a>,
              }}
            >
              {answer}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
