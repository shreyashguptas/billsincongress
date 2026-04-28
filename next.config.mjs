/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enables Partial Prerendering — homepage shell prerenders, the cached
  // dashboard data flushes from the edge, and any dynamic Suspense content
  // streams in. Required for the `'use cache'` directive in app/page.tsx.
  cacheComponents: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
}

export default nextConfig; 