'use client';

export interface TickerItem {
  label: string;
  value: string;
}

export default function TickerStrip({ items }: { items: TickerItem[] }) {
  const doubled = [...items, ...items];
  return (
    <div className="overflow-hidden border-y border-[rgba(239,159,39,0.1)] bg-[#0a0a0f]">
      <div className="flex animate-ticker whitespace-nowrap py-2.5">
        {doubled.map((item, i) => (
          <span key={i} className="flex items-center gap-3 px-8 text-xs">
            <span className="text-[#4a4a55] uppercase tracking-widest">{item.label}</span>
            <span className="font-mono text-[#ef9f27]">{item.value}</span>
            <span className="text-[rgba(239,159,39,0.2)]">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
