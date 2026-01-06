import type { Metadata } from 'next';
import './globals.css';
import Header from './components/Header';
import SessionProvider from './components/SessionProvider';

export const metadata: Metadata = {
  title: 'Inventory Matching System - MVP',
  description: 'AI-powered inventory matching system for Arnold Motor Supply',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>
          <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100">
            <Header />
            {children}
            <footer className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              &copy; {new Date().getFullYear()} Arnold Motor Supply Inventory Matching System - MVP Demo
            </footer>
          </div>
        </SessionProvider>
      </body>
    </html>
  );
}
