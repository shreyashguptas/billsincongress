import { NextResponse } from "next/server";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";
import { isPubliclyCacheable } from "./lib/cacheable-routes";

// Kept as "middleware.ts" (not Next.js 16's "proxy.ts") on purpose: proxy.ts is
// locked to the Node.js runtime, which the Cloudflare/OpenNext adapter doesn't
// support — it requires Edge middleware. The middleware.ts convention still
// runs on the Edge runtime, and all logic here (cookies, redirects, route
// matching via @convex-dev/auth) is Edge-compatible.
//
// We use @convex-dev/auth's middleware wrapper since it's the only way it can
// proxy /api/auth/* to Convex AND refresh session tokens. The wrapper accepts
// our custom handler, where we layer route protection + cache-control headers.

// Cookie / session lifetime. MUST match `SESSION_DURATION_MS` in
// `convex/auth.ts`. The cookie's maxAge needs to be ≥ the refresh-token's
// `inactiveDurationMs`, otherwise the browser drops the cookie before the
// server-side session expires and the user is signed out for no good reason.
//
// Cookie attributes set by `@convex-dev/auth/nextjs/server` (verified in lib
// source `dist/nextjs/server/cookies.js`):
//   - httpOnly: true   (XSS-safe — JS can't read tokens)
//   - sameSite: lax    (CSRF-safe, still works across OAuth redirects)
//   - secure:   true on prod, false on localhost
//   - path:     /
//   - prefix:   __Host- on prod (pins cookie to exact host, no subdomains)
//
// Three cookies are set: __Host-__convexAuthJWT (1h access token, rotates
// transparently), __Host-__convexAuthRefreshToken (60d, used to mint new
// access tokens), __Host-__convexAuthOAuthVerifier (short-lived, OAuth flow).
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

const isAuthPage = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);
const isProtectedRoute = createRouteMatcher(["/account(.*)"]);

export default convexAuthNextjsMiddleware(
  async (request, { convexAuth }) => {
    const { pathname, search } = request.nextUrl;

    // 0. Canonical host: 301 www → apex. `www.billsincongress.com` is attached
    //    to this Worker as a custom domain; this redirect keeps a single
    //    canonical hostname so search engines never see duplicate content.
    //    Fires only for the www host, so the bare apex is untouched.
    if (request.headers.get("host") === "www.billsincongress.com") {
      const url = request.nextUrl.clone();
      url.host = "billsincongress.com";
      url.port = "";
      return NextResponse.redirect(url, 301);
    }

    // 1. Bounce authed users away from sign-in/sign-up
    if (isAuthPage(request) && (await convexAuth.isAuthenticated())) {
      return nextjsMiddlewareRedirect(request, "/account");
    }

    // 2. Gate /account/* behind auth
    if (isProtectedRoute(request) && !(await convexAuth.isAuthenticated())) {
      const next = encodeURIComponent(pathname + search);
      return nextjsMiddlewareRedirect(request, `/sign-in?redirect=${next}`);
    }

    // 3. Default: proceed and apply cache headers
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    });

    // The only `/api/*` route the app exposes is `/api/auth/*`, served by
    // @convex-dev/auth and consumed same-origin from this Next.js app. No
    // documented cross-origin caller, so we deliberately don't set any
    // `Access-Control-Allow-*` headers here — adding `Origin: *` would only
    // broaden the surface for any future authenticated `/api/foo` route.

    // Every page is rendered below ConvexAuthNextjsServerProvider, whose own
    // response default is `no-store`. That is the right default for a page
    // that might be personalised and the wrong one for a page that never is:
    // `/learn` is the heaviest document on the site and was being rebuilt for
    // every single visitor, measuring 5.2s at the 75th percentile for largest
    // contentful paint against Google's 2.5s "good" threshold.
    //
    // Authenticated responses can carry user-specific auth bootstrap state and
    // must never reach a shared cache. Anonymous responses are byte-identical
    // for everyone. Cookie *presence* is the signal — no JWT validation needed
    // — and the refresh-token cookie counts too, since an expired JWT plus a
    // valid refresh token still re-auths mid-request and yields an authed
    // response.
    //
    // This is an allowlist rather than "everything except the private routes",
    // deliberately. A page missing from the list is merely uncached, which is
    // today's behaviour; a personalised page wrongly matching a denylist gap
    // would be a correctness bug. New public routes must be added here.
    if (isPubliclyCacheable(pathname)) {
      const hasAuthCookie =
        request.cookies.has("__Host-__convexAuthJWT") ||
        request.cookies.has("__convexAuthJWT") ||
        request.cookies.has("__Host-__convexAuthRefreshToken") ||
        request.cookies.has("__convexAuthRefreshToken");
      response.headers.set(
        "Cache-Control",
        hasAuthCookie
          ? "private, no-store"
          : "public, max-age=0, s-maxage=300, stale-while-revalidate=86400",
      );
    }

    return response;
  },
  { cookieConfig: { maxAge: SESSION_COOKIE_MAX_AGE_SECONDS } },
);

// The matcher includes /api/* so /api/auth/* requests reach the proxy and get
// forwarded to Convex. Files with extensions and _next are excluded.
export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
