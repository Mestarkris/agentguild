import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Nav from '@/components/Nav';
import { Providers } from './providers';

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AgentGuild — AI Agent Marketplace',
  description: 'Pay AI agents per task with Arc/USDC nanopayments',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="min-h-screen bg-[#050508] text-white antialiased">
        <Providers>
          <Nav />
          <main className="pt-14">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
