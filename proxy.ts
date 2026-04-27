import { NextResponse } from "next/server";
import {
  convexAuthNextjsMiddleware,
  createRouteMatcher,
  nextjsMiddlewareRedirect,
} from "@convex-dev/auth/nextjs/server";

// Next.js 16 calls this file "proxy.ts" (formerly middleware.ts).
// We use @convex-dev/auth's middleware wrapper since it's the only way it can
// proxy /api/auth/* to Convex AND refresh session tokens. The wrapper accepts
// our custom handler, where we layer route protection + the existing CORS and
// cache-control behavior previously in proxy.ts.

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

    // 3. Default: proceed and apply existing CORS / cache headers
    const response = NextResponse.next();

    // CORS for /api/* — preserves prior behavior
    if (pathname.startsWith("/api/")) {
      response.headers.set("Access-Control-Allow-Origin", "*");
      response.headers.set(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      response.headers.set(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization",
      );
    }

    // Cache headers for /bills page routes — preserves prior behavior
    if (pathname.startsWith("/bills") && !pathname.includes("api")) {
      response.headers.set(
        "Cache-Control",
        "public, s-maxage=3600, stale-while-revalidate=59",
      );
    }

    return response;
  },
  { cookieConfig: { maxAge: 60 * 60 * 24 * 30 } }, // 30-day sessions
);

// The matcher includes /api/* so /api/auth/* requests reach the proxy and get
// forwarded to Convex. Files with extensions and _next are excluded.
export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};
