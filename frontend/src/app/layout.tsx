import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { Providers } from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'DocMind',
  description: 'AI knowledge assistant with agentic actions',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-gray-200 bg-white">
          <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
            <Link href="/" className="text-lg font-bold text-gray-900">
              DocMind
            </Link>
            <Link
              href="/documents"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Documents
            </Link>
            <Link
              href="/chat"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Chat
            </Link>
            <Link
              href="/notes"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Notes
            </Link>
            <Link
              href="/tasks"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Tasks
            </Link>
            <Link
              href="/admin/traces"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Traces
            </Link>
          </nav>
        </header>
        <main className="flex-1"><Providers>{children}</Providers></main>
      </body>
    </html>
  );
}
