import type { MetadataRoute } from 'next';

// AI crawler policy (Phase 2 SEO decision, 2026-06-13):
//   ALLOW  AI *answer/search* bots — they fetch a page to answer a user's
//          question right now and link back, so they drive citations + traffic
//          (OAI-SearchBot, ChatGPT-User, PerplexityBot, Perplexity-User, plus the
//          regular search bots that power AI Overviews / Copilot: Googlebot,
//          bingbot, Applebot). These are allowed via the catch-all `*` rule.
//   BLOCK  AI *training* bots — they ingest content to train models with no
//          attribution. The ones listed below all honor robots.txt, so listing
//          them here is sufficient once Cloudflare's blanket "Block AI bots"
//          enforcement is turned off (otherwise CF 403s every AI bot, including
//          the answer bots we want).
//
// `/account` is per-user and `/api/` is not meant to be crawled — disallowed for
// everyone. Truly malicious scrapers ignore robots.txt and are handled at the
// Cloudflare edge separately.
const AI_TRAINING_BOTS = [
  'GPTBot', // OpenAI — model training
  'ClaudeBot', // Anthropic — model training
  'anthropic-ai',
  'Claude-Web',
  'CCBot', // Common Crawl — feeds many training datasets
  'Google-Extended', // Gemini / Vertex training (does NOT affect Google Search)
  'Applebot-Extended', // Apple Intelligence training (Applebot search still allowed)
  'Bytespider', // ByteDance
  'Amazonbot',
  'meta-externalagent', // Meta AI
  'FacebookBot',
  'cohere-ai',
  'Diffbot',
  'PetalBot',
  'Omgilibot',
  'ImagesiftBot',
  'Timpibot',
  'Webzio-Extended',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // AI training crawlers: blocked entirely.
      {
        userAgent: AI_TRAINING_BOTS,
        disallow: '/',
      },
      // Everyone else — search engines and AI answer/citation bots: allowed.
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account', '/api/'],
      },
    ],
    sitemap: 'https://billsincongress.com/sitemap_index.xml',
  };
}
