import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'] });

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://leadgtm.vercel.app';

export const metadata: Metadata = {
  title: 'leadgtm — Cold outbound on autopilot',
  description:
    'Open-source AI engine that discovers leads daily, enriches them, writes personalized email sequences, and sends via Resend.',
  keywords: [
    'cold email automation',
    'AI lead generation',
    'outbound sales',
    'email outreach',
    'go-to-market',
    'open source',
    'resend',
    'bright data',
  ],
  metadataBase: new URL(siteUrl),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'leadgtm — Cold outbound on autopilot',
    description:
      'Open-source AI engine that discovers leads, writes personalized emails, and sends via Resend. Every day, on autopilot.',
    url: siteUrl,
    siteName: 'leadgtm',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'leadgtm — Cold outbound on autopilot',
    description:
      'Open-source AI engine that discovers leads, writes personalized emails, and sends via Resend.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning>
        <main className="min-h-screen">{children}</main>
        <Toaster />
        <Analytics />
      </body>
    </html>
  );
}
