import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import { stream as answerStream } from "./answer";

const http = httpRouter();

// Mounts /api/auth/* — the @convex-dev/auth library handles signin, signout,
// callback, verify, refresh, etc. Required for the Next.js middleware to work.
auth.addHttpRoutes(http);

// Stub Stripe webhook. Returns 200 so we can register the endpoint with the
// Stripe dashboard during PR 1 setup. PR 2 replaces this with the real
// signature-verifying, idempotent handler in convex/stripe.ts.
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: httpAction(async (_ctx, _req) => {
    return new Response("stripe webhook stub — PR 2 implements", {
      status: 200,
    });
  }),
});

// Grounded answers, streamed as Server-Sent Events. Fronted by the Next.js
// route at app/api/answer/route.ts, which holds the httpOnly cookies this
// deployment cannot see.
http.route({
  path: "/answer/stream",
  method: "POST",
  handler: answerStream,
});

export default http;
