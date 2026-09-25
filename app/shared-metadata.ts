import { Viewport } from 'next';

export const sharedViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
};

export const sharedThemeColor = [
  { media: '(prefers-color-scheme: light)', color: '#f6f5f1' },
  { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
]; 