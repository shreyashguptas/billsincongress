import type { MetadataRoute } from 'next';

// The installed app (Documentation/overview.md, "Installed app"). Chrome, Edge
// and Android install from this; iOS reads the name and icons when a reader
// adds the site to their Home Screen, alongside the apple-touch-icon and
// `appleWebApp` in app/layout.tsx.
export default function manifest(): MetadataRoute.Manifest {
  return {
    // A fixed identity, so a later change to start_url does not read as a
    // different app to browsers that already installed this one.
    id: '/',
    name: 'Bills in Congress',
    short_name: 'Bills',
    description: 'An independent, nonpartisan record of every bill in the U.S. Congress.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'en-US',
    dir: 'ltr',
    categories: ['news', 'politics', 'education'],
    // Paper and ink — Documentation/brand.md.
    background_color: '#f6f5f1',
    theme_color: '#101418',
    // The app icon (public/brand/app-icon.svg) keeps the chamber inside the
    // maskable safe zone, the centre 80%, so one drawing serves both purposes.
    // Listed twice rather than as "any maskable", which makes browsers pad the
    // icon everywhere to be safe.
    icons: [
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press the app icon to jump straight to these.
    shortcuts: [
      {
        name: 'All bills',
        url: '/bills',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Bills that became law',
        short_name: 'Became law',
        url: '/bills/enacted',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' }],
      },
      {
        name: 'Your saved bills',
        short_name: 'Saved',
        url: '/account',
        icons: [{ src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' }],
      },
    ],
  };
}
