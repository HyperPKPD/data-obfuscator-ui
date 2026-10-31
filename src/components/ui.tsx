import { useId, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';

// ---------- icons (16px, stroke) ----------
const PATHS: Record<string, string> = {
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
  play: 'M7 4.5v15l12-7.5z',
  stop: 'M6 6h12v12H6z',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  x: 'M6 6l12 12M18 6 6 18',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  download: 'M12 4v12m0 0 5-5m-5 5-5-5M4 20h16',
  lock: 'M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z',
  shuffle: 'M4 7h3c4 0 5 10 9 10h4m0 0-3-3m3 3-3 3M4 17h3c1.6 0 2.7-1.3 3.7-3M13 8.5C13.8 7.6 14.8 7 16 7h4m0 0-3-3m3 3-3 3',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  terminal: 'M4 5h16v14H4zM8 10l3 2-3 2m5 0h3',
  chevron: 'm9 6 6 6-6 6',
  warn: 'M12 4 3 20h18zM12 10v4m0 3v.01',
  info: 'M12 11v6m0-9.5v.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  sheet: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  reset: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  collapse: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  plus: 'M12 5v14M5 12h14',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  layers: 'M12 4 3 9l9 5 9-5zM3 14l9 5 9-5',
};

export function Icon({ name, size = 16, className = '' }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={PATHS[name] ?? ''} />
    </svg>
  );
}

// ---------- button ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: string };
export function Button({ variant = 'secondary', size = 'md', icon, className = '', children, ...rest }: BtnProps) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:opacity-45 disabled:cursor-not-allowed select-none whitespace-nowrap';
  const sizes = { sm: 'h-8 px-3 text-[13px]', md: 'h-9 px-3.5 text-sm', lg: 'h-12 px-6 text-base' }[size];
  const variants = {
    primary: 'bg-brand text-brand-ink hover:opacity-90 shadow-[0_1px_0_rgba(255,255,255,.12)_inset]',
    secondary: 'bg-surface text-ink border border-line-strong hover:bg-sunken',
    ghost: 'text-muted hover:text-ink hover:bg-sunken',
    danger: 'bg-bad-soft text-bad border border-bad/30 hover:opacity-90',
  }[variant];
  return (
    <button type="button" className={`${base} ${sizes} ${variants} ${className}`} {...rest}>
      {icon && <Icon name={icon} size={size === 'lg' ? 18 : 15} />}
      {children}
    </button>
  );
}

// ---------- segmented control ----------
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; hint?: string }[];
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={`inline-flex rounded-lg bg-sunken p-0.5 border border-line ${className}`}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="radio"
            aria-checked={on}
            title={o.hint}
            type="button"
            onClick={() => onChange(o.value)}
            className={`px-3 h-8 rounded-md text-[13px] font-semibold transition-colors ${on ? 'bg-surface text-ink shadow-sm ring-1 ring-line-strong' : 'text-muted hover:text-ink'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- switch ----------
export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line-strong'}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-surface transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium leading-5">{label}</span>
        {hint && <span className="block text-[13px] text-muted leading-snug">{hint}</span>}
      </label>
    </div>
  );
}

// ---------- form bits ----------
export function Field({ label, hint, children, className = '' }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-sm font-semibold">{label}</div>
      {children}
      {hint && <div className="mt-1.5 text-[13px] leading-snug text-muted">{hint}</div>}
    </div>
  );
}

const inputCls = 'h-9 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm font-mono tabular-nums placeholder:text-faint focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/30';

export function NumberInput({ value, onChange, min, max, step, className = '', ariaLabel }: { value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; className?: string; ariaLabel?: string }) {
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      aria-label={ariaLabel}
      inputMode="decimal"
      className={`${inputCls} ${className}`}
      value={text ?? String(value)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value.trim() !== '' && Number.isFinite(n)) onChange(n);
      }}
      onBlur={() => setText(null)}
      min={min}
      max={max}
      step={step}
    />
  );
}

export function TextInput({ value, onChange, placeholder, className = '', ariaLabel, mono = true }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; ariaLabel?: string; mono?: boolean }) {
  return <input aria-label={ariaLabel} className={`${inputCls} ${mono ? '' : 'font-sans'} ${className}`} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
}

export function Select<T extends string>({ value, onChange, options, ariaLabel, className = '' }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; ariaLabel: string; className?: string }) {
  return (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value as T)} className={`h-8 rounded-md border border-line-strong bg-surface px-2 text-[13px] font-medium text-ink focus:border-focus focus:outline-none ${className}`}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 cursor-pointer rounded border-line-strong accent-[var(--brand)]" />;
}

// ---------- badges ----------
export function Badge({ tone = 'neutral', children, className = '' }: { tone?: 'neutral' | 'mask' | 'safe' | 'warn' | 'bad'; children: ReactNode; className?: string }) {
  const tones = {
    neutral: 'bg-sunken text-muted border-line',
    mask: 'bg-mask-soft text-mask-ink border-mask/25',
    safe: 'bg-safe-soft text-safe border-safe/25',
    warn: 'bg-warn-soft text-warn border-warn/30',
    bad: 'bg-bad-soft text-bad border-bad/30',
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[12px] font-semibold leading-5 ${tones} ${className}`}>{children}</span>;
}

// ---------- copy ----------
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      icon={done ? 'check' : 'copy'}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
    >
      {done ? 'Copied' : label}
    </Button>
  );
}

// ---------- tabs ----------
export interface TabDef {
  id: string;
  label: string;
  note?: string;
}
export function Tabs({ tabs, active, onChange, label }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="scroll-thin flex gap-1 overflow-x-auto border-b border-line px-2 pt-2">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={on}
            aria-controls={`panel-${t.id}`}
            type="button"
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              const i = tabs.findIndex((x) => x.id === active);
              if (e.key === 'ArrowRight') onChange(tabs[(i + 1) % tabs.length].id);
              if (e.key === 'ArrowLeft') onChange(tabs[(i - 1 + tabs.length) % tabs.length].id);
            }}
            className={`-mb-px whitespace-nowrap rounded-t-lg border border-b-0 px-3.5 py-2 text-sm font-semibold transition-colors ${on ? 'border-line bg-surface text-ink' : 'border-transparent text-muted hover:text-ink'}`}
          >
            {t.label}
            {t.note && <span className="ml-2 font-mono text-[11px] font-normal text-faint">{t.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------- section card ----------
export function Card({ title, aside, children, className = '', id }: { title?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`rounded-xl border border-line bg-surface ${className}`}>
      {(title || aside) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-[15px] font-bold tracking-tight">{title}</h2>
          {aside}
        </header>
      )}
      {children}
    </section>
  );
}
