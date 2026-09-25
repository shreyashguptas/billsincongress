import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Bills in Congress',
    short_name: 'Bills',
    description: 'An independent, nonpartisan record of every bill in the U.S. Congress.',
    start_url: '/',
    display: 'standalone',
    // Paper and ink — Documentation/brand.md.
    background_color: '#f6f5f1',
    theme_color: '#101418',
    icons: [
      {
        src: '/icons/icon-192x192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-384x384.png',
        sizes: '384x384',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512x512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
} 