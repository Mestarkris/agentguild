'use client';

export interface TickerItem {
  label: string;
  value: string;
}

export default function TickerStrip({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];

  return (
    <>
      {/* Mobile grid — visible below 640 px, hidden above */}
      <div className="ticker-mobile sm:hidden border-y border-[var(--border-accent-dim)] bg-[var(--surface-2)] px-4 py-3">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {items.map((item, i) => (
            <div key={i} className="flex flex-col gap-0.5 min-w-0">
              <span className="text-[9px] font-mono text-[var(--text-4)] uppercase tracking-[0.08em] truncate">
                {item.label}
              </span>
              <span className="text-[13px] font-mono font-semibold text-[var(--accent)] truncate">
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop ticker — hidden below 640 px, visible above */}
      <div className="ticker-desktop hidden sm:block overflow-hidden border-y border-[var(--border-accent-dim)] bg-[var(--surface-2)]">
        <div className="flex animate-ticker whitespace-nowrap py-2.5">
          {doubled.map((item, i) => (
            <span key={i} className="flex items-center gap-3 px-8 text-xs">
              <span className="text-[var(--text-4)] uppercase tracking-widest">{item.label}</span>
              <span className="font-mono text-[var(--accent)]">{item.value}</span>
              <span className="text-[var(--text-5)] opacity-60">·</span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
