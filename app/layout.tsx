import type { Metadata, Viewport } from 'next';
import { Rubik } from 'next/font/google';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

const rubik = Rubik({
  subsets: ['hebrew', 'latin'],
  variable: '--font-rubik',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ניהול עסק',
  description: 'תוכנת ניהול לעוסק פטור — קבלות, חשבוניות, הוצאות ודוח שנתי',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: 'ניהול עסק', statusBarStyle: 'default' },
  icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={rubik.variable}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
