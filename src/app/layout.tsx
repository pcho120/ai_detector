import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Detect Essay Review',
  description: 'Upload an essay for a basic review shell.'
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
