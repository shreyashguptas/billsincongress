import { Viewport } from 'next';

export const sharedViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const sharedThemeColor = [
  { media: '(prefers-color-scheme: light)', color: '#f6f3ec' },
  { media: '(prefers-color-scheme: dark)', color: '#16181d' },
]; 