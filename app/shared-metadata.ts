import { Viewport } from 'next';

export const sharedViewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  // Android: the on-screen keyboard shrinks the page instead of covering it,
  // so the ask composer and any focused field stay above the keys. iOS ignores
  // it; the ask panel measures the keyboard itself there (--ask-kb).
  interactiveWidget: 'resizes-content',
};

export const sharedThemeColor = [
  { media: '(prefers-color-scheme: light)', color: '#f6f5f1' },
  { media: '(prefers-color-scheme: dark)', color: '#0b0d10' },
]; 