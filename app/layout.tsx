import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Galileo - Natural Language to SQL',
  description: 'Convert natural language to SQL queries with AI-powered insights',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
