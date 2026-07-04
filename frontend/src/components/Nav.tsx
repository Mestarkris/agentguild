'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useWallet } from '@/lib/wallet';

const links = [
  { href: '/',           label: 'Submit',      exact: true  },
  { href: '/jobs',       label: 'Jobs',         exact: false },
  { href: '/marketplace',label: 'Marketplace',  exact: true  },
  { href: '/showcase',   label: 'Showcase',     exact: true  },
  { href: '/dashboard',  label: 'Dashboard',    exact: true  },
];

function truncAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export default function Nav() {
  const path = usePathname();
  const { address, balance, connecting, connect, disconnect } = useWallet();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [menuOpen]);

  // Close dropdown on route change
  useEffect(() => { setMenuOpen(false); }, [path]);

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
                    : 'text-[#6b6b78] hover:text-white hover:bg-[rgba(255,255,255,0.05)]',
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
            <div className="relative flex items-center gap-2" ref={menuRef}>
              {/* Balance pill — desktop only */}
              {balance && (
                <span className="text-xs font-mono text-[#ef9f27] hidden sm:block">
                  {balance} USDC
                </span>
              )}

              {/* Address button — toggles dropdown */}
              <button
                onClick={() => setMenuOpen(v => !v)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-mono transition-colors',
                  menuOpen
                    ? 'border-[rgba(239,159,39,0.5)] bg-[rgba(239,159,39,0.1)] text-[#ef9f27]'
                    : 'border-[rgba(239,159,39,0.3)] text-[#ef9f27] hover:bg-[rgba(239,159,39,0.08)]',
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#ef9f27]" />
                {truncAddr(address)}
                <span className={clsx('transition-transform text-[10px] text-[#6b6b78]', menuOpen && 'rotate-180')}>
                  ▾
                </span>
              </button>

              {/* Dropdown */}
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-[#0d0d14] border border-[rgba(239,159,39,0.18)] rounded-xl shadow-2xl overflow-hidden z-50">
                  {/* Address + balance header */}
                  <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.06)]">
                    <div className="text-[10px] text-[#4a4a55] font-mono mb-0.5">Connected</div>
                    <div className="text-xs font-mono text-white truncate">{address}</div>
                    {balance && (
                      <div className="text-xs font-mono text-[#ef9f27] mt-0.5">{balance} USDC</div>
                    )}
                    <div className="text-[10px] font-mono text-[#4a4a55] mt-0.5">Arc Testnet · Chain 5042002</div>
                  </div>
                  {/* Actions */}
                  <div className="p-1">
                    <button
                      onClick={() => { disconnect(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#ef4444] hover:bg-[rgba(239,68,68,0.08)] rounded-lg transition-colors font-mono text-left"
                    >
                      <span>✕</span>
                      <span>Disconnect Wallet</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={connect}
              disabled={connecting}
              className="px-3 py-1.5 rounded-md border border-[rgba(239,159,39,0.3)] text-xs text-[#ef9f27] hover:bg-[rgba(239,159,39,0.08)] disabled:opacity-50 transition-colors font-mono"
            >
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
