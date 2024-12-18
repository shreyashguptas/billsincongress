import { Metadata } from 'next';

type ThemeConfig = {
  themeColor: Metadata['themeColor'];
};

export const themeConfig: ThemeConfig = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#000000' },
  ],
}; 