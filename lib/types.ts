export interface Bill {
  id: string;
  title: string;
  sponsor: string;
  introduced: string;
  status: string;
  progress: number;
  summary: string;
  tags: string[];
  aiSummary?: string;
  lastUpdated?: string;
  voteCount?: {
    yea: number;
    nay: number;
    present: number;
    notVoting: number;
  };
}