import { NextRequest, NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import {
  type ChatGateway,
  MAX_QUESTION_LENGTH,
  buildGateway,
  getConvexClient,
  getOrCreateAnonCookie,
  setConvexAuth,
  withAnonCookie,
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

  const { billId, sessionId, question } = body as {
    billId?: unknown;
    sessionId?: unknown;
    question?: unknown;
  };

  if (typeof billId !== "string" || billId.length === 0 || billId.length > 80) {
    return badRequest("Invalid billId.");
  }
  if (
    typeof sessionId !== "string" ||
    sessionId.length === 0 ||
    sessionId.length > 128
  ) {
    return badRequest("Invalid sessionId.");
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

  const { value: anonCookie, shouldSet } = getOrCreateAnonCookie(request);
  let gateway: ChatGateway;
  try {
    gateway = buildGateway(request, anonCookie);
  } catch {
    return NextResponse.json(
      { answer: "", error: "Chat gateway is not configured." },
      { status: 500 },
    );
  }

  await setConvexAuth(client);

  const result = await client.action(api.llm.sendChatMessage, {
    billId,
    sessionId,
    question,
    gateway,
  });

  return withAnonCookie(NextResponse.json(result), anonCookie, shouldSet);
}
