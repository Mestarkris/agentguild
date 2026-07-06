import clsx from 'clsx';

const CONFIG: Record<string, { label: string; dot: string; text: string; bg: string; pulse: boolean }> = {
  pending:   { label: 'Pending',   dot: 'bg-gray-400 dark:bg-slate-500',  text: 'text-gray-500 dark:text-slate-400',  bg: 'bg-gray-100 dark:bg-slate-800',   pulse: false },
  planning:  { label: 'Planning',  dot: 'bg-blue-500 dark:bg-blue-400',   text: 'text-blue-600 dark:text-blue-300',   bg: 'bg-blue-50 dark:bg-blue-900/30',  pulse: true  },
  running:   { label: 'Running',   dot: 'bg-cyan-500 dark:bg-cyan-400',   text: 'text-cyan-600 dark:text-cyan-300',   bg: 'bg-cyan-50 dark:bg-cyan-900/30',  pulse: true  },
  settling:  { label: 'Settling',  dot: 'bg-yellow-500 dark:bg-yellow-400', text: 'text-yellow-600 dark:text-yellow-300', bg: 'bg-yellow-50 dark:bg-yellow-900/30', pulse: true },
  completed: { label: 'Completed', dot: 'bg-green-500 dark:bg-green-400', text: 'text-green-600 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-900/30', pulse: false },
  settled:   { label: 'Settled',   dot: 'bg-green-500 dark:bg-green-400', text: 'text-green-600 dark:text-green-300', bg: 'bg-green-50 dark:bg-green-900/30', pulse: false },
  failed:    { label: 'Failed',    dot: 'bg-red-500 dark:bg-red-400',     text: 'text-red-600 dark:text-red-300',     bg: 'bg-red-50 dark:bg-red-900/30',    pulse: false },
};

export default function StatusBadge({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const cfg = CONFIG[status] ?? CONFIG.pending;
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 rounded-full font-medium',
      cfg.text, cfg.bg,
      size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm'
    )}>
      <span className={clsx('rounded-full shrink-0', cfg.dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2', cfg.pulse && 'animate-pulse')} />
      {cfg.label}
    </span>
  );
}
