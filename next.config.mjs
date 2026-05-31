/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Baseline security response headers. CSP is intentionally NOT set here —
  // a real CSP for a Convex + Next app needs to allowlist the Convex
  // deployment URL, Google OAuth endpoints, and any analytics origin, and
  // would break things if rolled in unattended. Add as a separate exercise.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Block clickjacking — nothing in this app is meant to be iframed.
          { key: 'X-Frame-Options', value: 'DENY' },
          // Disable MIME-sniffing on responses (e.g. JSON misread as HTML).
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Don't leak full URLs (with query strings) in cross-origin Referer.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Deny sensor/device APIs the app doesn't use.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
}

export default nextConfig;