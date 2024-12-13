export interface Bill {
  id: string;
  title: string;
  congressNumber: number;
  billType: string;
  billNumber: number;
  sponsorName: string;
  sponsorState: string;
  sponsorParty: string;
  sponsorBioguideId: string;
  committeeCount: number;
  latestActionText: string;
  latestActionDate: string;
  updateDate: string;
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