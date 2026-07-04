'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useWallet } from '@/lib/wallet';

const links = [
  { href: '/', label: 'Submit', exact: true },
  { href: '/jobs', label: 'Jobs', exact: false },
  { href: '/marketplace', label: 'Marketplace', exact: true },
  { href: '/showcase', label: 'Showcase', exact: true },
  { href: '/dashboard', label: 'Dashboard', exact: true },
];

function truncAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Nav() {
  const path = usePathname();
  const { address, balance, connecting, connect, disconnect } = useWallet();

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[rgba(239,159,39,0.12)] bg-[#050508]/90 backdrop-blur-md">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg border border-[rgba(239,159,39,0.4)] flex items-center justify-center text-[10px] font-bold text-[#ef9f27] font-mono">
            AG
          </div>
          <span className="font-bold text-white">
            Agent<span className="text-[#ef9f27]">Guild</span>
          </span>
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map(l => {
            const active = l.exact ? path === l.href : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={clsx(
                  'px-3 py-1.5 rounded-md text-sm transition-colors',
                  active
                    ? 'text-white bg-[rgba(239,159,39,0.12)]'
                    : 'text-[#6b6b78] hover:text-white hover:bg-[rgba(255,255,255,0.05)]'
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Wallet */}
        <div className="ml-auto flex items-center gap-2">
          {address ? (
            <div className="flex items-center gap-2">
              {balance && (
                <span className="text-xs font-mono text-[#ef9f27] hidden sm:block">
                  {balance} USDC
                </span>
              )}
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md border border-[rgba(239,159,39,0.3)] text-xs font-mono text-[#ef9f27] hover:bg-[rgba(239,159,39,0.08)] transition-colors"
                title="Disconnect wallet"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef9f27]" />
                {truncAddr(address)}
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="px-3 py-1.5 rounded-md border border-[rgba(239,159,39,0.3)] text-xs text-[#ef9f27] hover:bg-[rgba(239,159,39,0.08)] disabled:opacity-50 transition-colors"
            >
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
