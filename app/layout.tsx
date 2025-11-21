import type { Metadata } from 'next';
import './globals.css';
import MainLayout from '@/components/layout/MainLayout';

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
    <html lang="zh-CN" data-theme="light">
      <body className="antialiased">
        <MainLayout>{children}</MainLayout>
      </body>
    </html>
  );
}
