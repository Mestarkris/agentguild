'use client';

import { WalletProvider } from '@/lib/wallet';
import { ThemeProvider } from '@/lib/theme';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <WalletProvider>{children}</WalletProvider>
    </ThemeProvider>
  );
}
