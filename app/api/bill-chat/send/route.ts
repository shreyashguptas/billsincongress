import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  MAX_QUESTION_LENGTH,
  debugBillChatAuth,
  getConvexClient,
  getOrCreateAnonymousChatSessionId,
  setConvexAuth,
} from "../_shared";
import {
  captureServerEvent,
  captureServerException,
  POSTHOG_DISTINCT_ID_HEADER,
  POSTHOG_SESSION_ID_HEADER,
} from "@/lib/posthog-server";

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

  const { billId, question, clientSessionId } = body as {
    billId?: unknown;
    question?: unknown;
    clientSessionId?: unknown;
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
  if (
    clientSessionId !== undefined &&
    (typeof clientSessionId !== "string" ||
      clientSessionId.length === 0 ||
      clientSessionId.length > 120)
  ) {
    return badRequest("Invalid clientSessionId.");
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

  // Browser's PostHog identity (if any) so the server event lands on the same
  // person/session; falls back to the anonymous chat session id.
  const phDistinctId =
    request.headers.get(POSTHOG_DISTINCT_ID_HEADER) ?? anonymousSessionId;
  const phSessionId = request.headers.get(POSTHOG_SESSION_ID_HEADER);

  let result;
  try {
    result = await client.action(api.llm.sendChatMessage, {
      billId,
      question,
      anonymousSessionId,
      ...(typeof clientSessionId === "string" ? { clientSessionId } : {}),
    });
  } catch (error) {
    await captureServerException(error, phDistinctId, { route: "bill-chat/send" });
    throw error;
  }
  debugBillChatAuth("send-result", {
    hadToken: auth.hasToken,
    hasError: Boolean(result.error),
    rateLimitKind: result.rateLimit?.kind,
    rateLimitMax: result.rateLimit?.max,
  });

  // Server-side source of truth for every processed chat message (the costly
  // LLM action) — complements the client-side bill_chat_* events.
  await captureServerEvent(phDistinctId, "bill_chat_message_processed", {
    bill_id: billId,
    success: !result.error,
    rate_limited: result.error === "RATE_LIMITED",
    user_type: auth.hasToken ? "authed" : "anonymous",
    question_length: question.length,
    ...(phSessionId ? { $session_id: phSessionId } : {}),
  });

  return NextResponse.json(result);
}
