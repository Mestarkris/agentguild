'use client';

export interface TickerItem {
  label: string;
  value: string;
}

export default function TickerStrip({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-[var(--border-accent-dim)] bg-[var(--surface-2)]">
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
  );
}
