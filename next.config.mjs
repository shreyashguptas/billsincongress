import { execSync } from 'node:child_process';

// A per-deploy id that is stable within one build. When set, Next.js adds it to
// every asset request and turns on skew protection: a stale tab whose id no
// longer matches the server does a full reload on navigation instead of a
// client-side one, so it never asks for a chunk the new deploy dropped — the
// proactive companion to the app/error.tsx recovery. Prefer the CI-provided
// commit, then the git commit; return undefined (a no-op) when neither exists,
// since Date.now() would differ between the build's worker processes.
function resolveDeploymentId() {
  const fromEnv = process.env.DEPLOYMENT_ID || process.env.WORKERS_CI_COMMIT_SHA;
  if (fromEnv) return fromEnv;
  try {
    return (
      execSync('git rev-parse --short HEAD', {
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .toString()
        .trim() || undefined
    );
  } catch {
    return undefined;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  deploymentId: resolveDeploymentId(),
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
          // Refuse to speak plain HTTP to this host for a year. Session
          // cookies here are set Secure, so they are never sent over plain
          // HTTP -- but without HSTS a first visit typed as http:// is still
          // one downgradable round trip before the redirect to HTTPS lands.
          //
          // includeSubDomains is safe: `www` is the only subdomain that
          // resolves, and it redirects to the apex over HTTPS. `mail` holds
          // email records with no A record, so no subdomain serves HTTP.
          //
          // `preload` is deliberately omitted. It means submitting the domain
          // to a list shipped inside browsers, which is slow to undo and is a
          // decision to take on purpose rather than inherit from a patch.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains',
          },
        ],
      },
    ];
  },
}

export default nextConfig;