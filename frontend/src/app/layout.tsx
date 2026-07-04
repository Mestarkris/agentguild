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
  const mockMode = process.env.MOCK_MODE === 'true';
  return (
    <html lang="en" className={jetbrainsMono.variable}>
      <body className="min-h-screen bg-[#050508] text-white antialiased">
        <Providers>
          <Nav />
          {mockMode && (
            <div className="fixed top-14 left-0 right-0 z-40 bg-amber-400 text-black text-[11px] font-mono font-bold text-center py-1 tracking-widest">
              ⚠ MOCK MODE ACTIVE — zero real API calls · set MOCK_MODE=false to disable
            </div>
          )}
          <main className={mockMode ? 'pt-20' : 'pt-14'}>{children}</main>
        </Providers>
      </body>
    </html>
  );
}
