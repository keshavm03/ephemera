import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Ephemera — chat that deletes itself',
  description:
    'Login-free chat rooms with private DMs, GIFs and stickers. Pick a throwaway name, talk, end the room — and every trace of it is gone.',
  openGraph: {
    title: 'Ephemera — chat that deletes itself',
    description: 'Login-free chat rooms that vanish when you end them.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#08090c',
  width: 'device-width',
  initialScale: 1,
  // The composer is fixed to the bottom; this keeps it above the iOS keyboard.
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
