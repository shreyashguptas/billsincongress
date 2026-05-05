import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  MAX_QUESTION_LENGTH,
  debugBillChatAuth,
  getConvexClient,
  getOrCreateAnonymousChatSessionId,
  setConvexAuth,
} from "../_shared";

function badRequest(message: string) {
  return NextResponse.json({ answer: "", error: message }, { status: 400 });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Invalid JSON body.");
  }

  const { billId, question } = body as {
    billId?: unknown;
    question?: unknown;
  };

  if (typeof billId !== "string" || billId.length === 0 || billId.length > 80) {
    return badRequest("Invalid billId.");
  }
  if (
    typeof question !== "string" ||
    question.trim().length === 0 ||
    question.length > MAX_QUESTION_LENGTH
  ) {
    return badRequest("Question must be between 1 and 2000 characters.");
  }

  const client = getConvexClient();
  if (!client) {
    return NextResponse.json(
      { answer: "", error: "Service not available" },
      { status: 503 },
    );
  }

  const auth = await setConvexAuth(client, "send");
  const anonymousSessionId = await getOrCreateAnonymousChatSessionId();

  const result = await client.action(api.llm.sendChatMessage, {
    billId,
    question,
    anonymousSessionId,
  });
  debugBillChatAuth("send-result", {
    hadToken: auth.hasToken,
    hasError: Boolean(result.error),
    rateLimitKind: result.rateLimit?.kind,
    rateLimitMax: result.rateLimit?.max,
  });

  return NextResponse.json(result);
}
