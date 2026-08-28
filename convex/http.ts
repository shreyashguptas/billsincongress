import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { stream as answerStream } from "./answer";

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

export default http;
