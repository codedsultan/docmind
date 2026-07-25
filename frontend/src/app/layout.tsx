import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import Link from 'next/link';
import { Providers } from './providers';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LogoutButton } from '@/components/LogoutButton';

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
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Providers>
          <header className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
            <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
              <Link href="/" className="text-lg font-bold text-gray-900 dark:text-gray-100">
                DocMind
              </Link>
              <Link
                href="/documents"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Documents
              </Link>
              <Link
                href="/chat"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Chat
              </Link>
              <Link
                href="/notes"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Notes
              </Link>
              <Link
                href="/tasks"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Tasks
              </Link>
              <Link
                href="/admin/traces"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                Traces
              </Link>
              <ThemeToggle />
              <LogoutButton />
            </nav>
          </header>
          <main className="flex-1">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
