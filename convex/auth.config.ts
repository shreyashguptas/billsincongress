// JWT verification config read by Convex at function startup.
// Without this file, ctx.auth.getUserIdentity() always returns null.
// CONVEX_SITE_URL is auto-populated by `npx @convex-dev/auth`.

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL,
      applicationID: "convex",
    },
  ],
};
