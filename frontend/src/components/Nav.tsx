'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { useWallet } from '@/lib/wallet';
import { useTheme } from '@/lib/theme';

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

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export default function Nav() {
  const path = usePathname();
  const { address, balance, connecting, connect, disconnect } = useWallet();
  const { theme, toggle } = useTheme();

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => { setMenuOpen(false); }, [path]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 nav-surface backdrop-blur-md border-b border-[var(--border-accent-dim)]">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-8">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg border border-[var(--border-accent-mid)] flex items-center justify-center text-[10px] font-bold text-[var(--accent)] font-mono">
            AG
          </div>
          <span className="font-bold text-[var(--text-1)]">
            Agent<span className="text-[var(--accent)]">Guild</span>
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
                    ? 'text-[var(--text-1)] bg-[var(--hover-accent-bg)]'
                    : 'text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--tint-accent)]',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={toggle}
            className="p-1.5 rounded-md text-[var(--text-3)] hover:text-[var(--text-1)] hover:bg-[var(--tint-accent)] transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>

          {/* Wallet */}
          {address ? (
            <div className="relative flex items-center gap-2" ref={menuRef}>
              {balance && (
                <span className="text-xs font-mono text-[var(--accent)] hidden sm:block">
                  {balance} USDC
                </span>
              )}
              <button
                onClick={() => setMenuOpen(v => !v)}
                className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-mono transition-colors',
                  menuOpen
                    ? 'border-[var(--border-accent-mid)] bg-[var(--hover-accent-bg)] text-[var(--accent)]'
                    : 'border-[var(--border-accent-dim)] text-[var(--accent)] hover:bg-[var(--tint-accent)]',
                )}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                {truncAddr(address)}
                <span className={clsx('transition-transform text-[10px] text-[var(--text-3)]', menuOpen && 'rotate-180')}>
                  ▾
                </span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-52 bg-[var(--surface)] border border-[var(--border-accent-dim)] rounded-xl shadow-2xl overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-[var(--divider)]">
                    <div className="text-[10px] text-[var(--text-4)] font-mono mb-0.5">Connected</div>
                    <div className="text-xs font-mono text-[var(--text-1)] truncate">{address}</div>
                    {balance && (
                      <div className="text-xs font-mono text-[var(--accent)] mt-0.5">{balance} USDC</div>
                    )}
                    <div className="text-[10px] font-mono text-[var(--text-4)] mt-0.5">Arc Testnet · Chain 5042002</div>
                  </div>
                  <div className="p-1">
                    <button
                      onClick={() => { disconnect(); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-[rgba(239,68,68,0.08)] rounded-lg transition-colors font-mono text-left"
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
              className="px-3 py-1.5 rounded-md border border-[var(--border-accent-dim)] text-xs text-[var(--accent)] hover:bg-[var(--tint-accent)] disabled:opacity-50 transition-colors font-mono"
            >
              {connecting ? 'Connecting…' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
