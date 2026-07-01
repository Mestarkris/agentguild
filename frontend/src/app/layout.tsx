import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/Nav';

export const metadata: Metadata = {
  title: 'AgentGuild — AI Agent Marketplace',
  description: 'Pay AI agents per task with Arc/USDC nanopayments',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-white antialiased">
        <Nav />
        <main className="pt-14">{children}</main>
      </body>
    </html>
  );
}
