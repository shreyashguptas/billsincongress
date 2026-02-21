import { action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "nvidia/nemotron-3-nano-30b-a3b";

interface BillContext {
  billId: string;
  congress: number;
  billType: string;
  billNumber: string;
  billTypeLabel: string;
  title: string;
  introducedDate: string;
  sponsorFirstName: string;
  sponsorLastName: string;
  sponsorParty: string;
  sponsorState: string;
  progressStage: number;
  progressDescription: string;
  policyArea: string;
  summary: string;
  pdfUrl: string;
  actions: Array<{ date: string; description: string }>;
}

function buildPrompt(bill: BillContext, question: string): string {
  const stageDescriptions: Record<number, string> = {
    20: "Introduced",
    40: "In Committee", 
    60: "Passed One Chamber",
    80: "Passed Both Chambers",
    85: "Vetoed",
    90: "To President",
    95: "Signed by President",
    100: "Became Law",
  };

  const partyNames: Record<string, string> = {
    R: "Republican",
    D: "Democrat",
    I: "Independent",
  };

  const sponsorParty = partyNames[bill.sponsorParty] || bill.sponsorParty;

  const context = `# BILL INFORMATION

## Basic Details
- **Bill ID**: ${bill.billId}
- **Congress**: ${bill.congress}th Congress
- **Bill Type**: ${bill.billTypeLabel} ${bill.billNumber}
- **Title**: ${bill.title}
- **Introduced Date**: ${bill.introducedDate}
- **Policy Area**: ${bill.policyArea || "Not specified"}

## Sponsor
- **Name**: ${bill.sponsorFirstName} ${bill.sponsorLastName}
- **Party**: ${sponsorParty}
- **State**: ${bill.sponsorState}

## Current Status
- **Stage**: ${bill.progressDescription} (${stageDescriptions[bill.progressStage] || "Unknown"})
- **Progress**: ${bill.progressStage}/100

## Official Summary
${bill.summary || "No official summary available."}

## Legislative History (Recent Actions)
${bill.actions.slice(0, 10).map((a, i) => `${i + 1}. [${a.date}] ${a.description}`).join("\n") || "No actions recorded."}

# USER QUESTION
${question}

# INSTRUCTIONS
You are a helpful assistant that explains U.S. legislation to regular citizens. 
Answer the user's question based ONLY on the bill information provided above.
- Be clear, accurate, and easy to understand
- If you're unsure about something, say so
- Use plain language - avoid legal jargon where possible
- Cite specific details from the bill when relevant
- Keep your answer concise but informative (2-4 paragraphs max unless the question requires more detail)
- Note: This database only includes the primary sponsor. Check the bill text for any co-sponsors that may be listed.

# ANSWER
`;

  return context;
}

export const askBillQuestion = action({
  args: {
    billId: v.string(),
    question: v.string(),
  },
  handler: async (ctx, args): Promise<{ answer: string; error?: string }> => {
    const { billId, question } = args;

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return { answer: "", error: "OpenRouter API key not configured." };
    }

    try {
      const bill = await ctx.runQuery(api.bills.getById, { billId });

      if (!bill) {
        return { answer: "", error: "Bill not found." };
      }

      const actions = await ctx.runQuery(internal.bills.getBillActions, { billId });

      const billContext: BillContext = {
        billId: bill.billId || "",
        congress: bill.congress || 119,
        billType: bill.billType || "",
        billNumber: bill.billNumber || "",
        billTypeLabel: bill.billTypeLabel || "",
        title: bill.title || "",
        introducedDate: bill.introducedDate || "",
        sponsorFirstName: bill.sponsorFirstName || "",
        sponsorLastName: bill.sponsorLastName || "",
        sponsorParty: bill.sponsorParty || "",
        sponsorState: bill.sponsorState || "",
        progressStage: bill.progressStage || 20,
        progressDescription: getStageDescription(bill.progressStage || 20),
        policyArea: bill.bill_subjects?.policy_area_name || "",
        summary: bill.latest_summary || "",
        pdfUrl: bill.pdf_url || "",
        actions: actions || [],
      };

      const prompt = buildPrompt(billContext, question);

      const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": "https://billsincongress.com",
          "X-Title": "BillsInCongress",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: 2048,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenRouter API error:", errorText);
        return { answer: "", error: "Failed to get response from AI." };
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || "No response generated.";

      return { answer };

    } catch (error) {
      console.error("Error in askBillQuestion:", error);
      return { answer: "", error: "An unexpected error occurred." };
    }
  },
});

function getStageDescription(stage: number): string {
  const descriptions: Record<number, string> = {
    20: "Introduced",
    40: "In Committee",
    60: "Passed One Chamber",
    80: "Passed Both Chambers",
    85: "Vetoed",
    90: "To President",
    95: "Signed by President",
    100: "Became Law",
  };
  return descriptions[stage] || "Unknown";
}
