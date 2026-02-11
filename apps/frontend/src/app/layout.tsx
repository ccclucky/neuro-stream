import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { Navigation } from '@/components/navigation';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NeuroStream | AI Agent Payment Protocol',
  description: 'Agent-native payment and settlement protocol with on-chain escrow guarantees',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} antialiased bg-[#FAFAFA]`}>
        <Providers>
          <div className="min-h-screen">
            <Navigation />
            <main className="pt-20 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
