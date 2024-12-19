export interface Bill {
  id?: string;
  congress?: number;
  type?: string;
  number?: string;
  title: string;
  congressNumber: number;
  billType: string;
  billNumber: number;
  sponsorName: string;
  sponsorState: string;
  sponsorParty: string;
  sponsorBioguideId: string;
  committeeCount: number;
  latestAction?: {
    actionDate: string;
    text: string;
  };
  latestActionText: string;
  latestActionDate: string;
  updateDate: string;
  updateDateIncludingText?: string;
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
  originChamber: string;
  originChamberCode: string;
  congressGovUrl: string;
  url?: string;
  statusHistory: {
    date: string;
    oldStatus?: string;
    newStatus: string;
    actionText: string;
  }[];
  lastStatusChange?: string;
  introducedDate: string;
  constitutionalAuthorityText?: string;
  officialTitle: string;
  shortTitle?: string;
  cosponsorsCount: number;
  billTextUrl?: string;
  billPdfUrl?: string;
}