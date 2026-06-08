import type { MetadataRoute } from 'next';

// Serves /robots.txt (previously a 404). Well-behaved crawlers honor this;
// malicious scanners ignore it — those are turned away at the Cloudflare edge.
// `/account` is per-user and `/api/` is not meant to be crawled.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/account', '/api/'],
    },
    host: 'https://billsincongress.com',
  };
}
