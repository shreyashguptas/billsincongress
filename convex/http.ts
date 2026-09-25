import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { stream as answerStream } from "./answer";
import { handleStripeWebhook } from "./billing";

const http = httpRouter();

// Mounts /api/auth/* — the @convex-dev/auth library handles signin, signout,
// callback, verify, refresh, etc. Required for the Next.js middleware to work.
auth.addHttpRoutes(http);

// Grounded answers, streamed as Server-Sent Events. Fronted by the Next.js
// route at app/api/answer/route.ts, which holds the httpOnly cookies this
// deployment cannot see.
http.route({
  path: "/answer/stream",
  method: "POST",
  handler: answerStream,
});

// Stripe subscription events. Signature-verified inside the handler; this is
// the only thing that sets a reader's plan (see convex/billing.ts).
http.route({
  path: "/stripe/webhook",
  method: "POST",
  handler: handleStripeWebhook,
});

export default http;
