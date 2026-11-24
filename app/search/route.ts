/**
 * `/search?q=…` → `/bills?title=…`, permanently. See `lib/search-redirect.ts`
 * for why a route that was never linked needs to exist.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { searchRedirectPath } from '@/lib/search-redirect';

export function GET(request: NextRequest) {
  return NextResponse.redirect(
    new URL(searchRedirectPath(request.nextUrl.searchParams), request.nextUrl),
    308,
  );
}
