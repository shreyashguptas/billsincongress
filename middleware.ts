import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // For maintenance mode - redirect all routes except the home page to the home page
  if (request.nextUrl.pathname !== '/' && !request.nextUrl.pathname.startsWith('/_next') && !request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Create a new NextResponse object with the same URL
  const response = NextResponse.next()

  // Set CORS headers for API routes (in case they're still needed)
  if (request.nextUrl.pathname.startsWith('/api/')) {
    response.headers.set('Access-Control-Allow-Origin', '*')
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  }

  // Add cache control for static pages
  if (
    request.nextUrl.pathname.startsWith('/bills') &&
    !request.nextUrl.pathname.includes('api')
  ) {
    response.headers.set(
      'Cache-Control',
      'public, s-maxage=3600, stale-while-revalidate=59'
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
} 