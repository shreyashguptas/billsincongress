import { NextResponse } from "next/server";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

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

    // `/bills` is rendered below ConvexAuthNextjsServerProvider. Authenticated
    // responses can contain user-specific auth bootstrap state, so never mark
    // the full page response public-cacheable.
    if (pathname.startsWith("/bills") && !pathname.includes("api")) {
      response.headers.set("Cache-Control", "private, no-store");
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
