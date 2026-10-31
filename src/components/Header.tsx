import { useEffect, useState } from 'react';
import { brand, links } from '../../app.config';
import type { EngineInfo } from '../shared/types';
import { Badge, Icon, Segmented } from './ui';

export function Header({
  engine,
  useReal,
  onUseReal,
  canToggle,
}: {
  engine: EngineInfo | null;
  useReal: boolean;
  onUseReal: (v: boolean) => void;
  canToggle: boolean;
}) {
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    try {
      return (localStorage.getItem('do-theme') as 'light' | 'dark') ?? 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      if (theme === 'system') localStorage.removeItem('do-theme');
      else localStorage.setItem('do-theme', theme);
    } catch {
      /* storage unavailable */
    }
  }, [theme]);
  const dark = theme === 'dark' || (theme === 'system' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches);

  const real = engine?.kind === 'real' && useReal;
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <a href="./" className="rounded-md" aria-label={`${brand.name} home`}>
          <span className="text-[17px] font-extrabold tracking-tight">{brand.name}</span>
        </a>
        <span className="hidden text-sm text-muted xl:inline">{brand.tagline}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <nav aria-label="Project links" className="flex items-center gap-1.5">
            <a href={links.docs.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-sunken" aria-label={`${links.docs.label} (opens in a new tab)`}>
              <Icon name="book" size={15} />
              <span className="hidden sm:inline">{links.docs.label}</span>
            </a>
            <a href={links.source.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold text-ink hover:bg-sunken" aria-label={`${links.source.label} on GitHub (opens in a new tab)`}>
              <Icon name="code" size={15} />
              <span className="hidden sm:inline">{links.source.label}</span>
            </a>
          </nav>
          {engine === null ? (
            <Badge>Checking engine…</Badge>
          ) : real ? (
            <Badge tone="safe" className="!text-[12.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-safe" />
              Version {engine.version}
            </Badge>
          ) : (
            <Badge tone="warn" className="!text-[12.5px]">
              <span className="h-1.5 w-1.5 rounded-full bg-warn" />
              Simulation
            </Badge>
          )}
          {canToggle && (
            <Segmented
              label="Engine"
              value={useReal ? 'real' : 'sim'}
              onChange={(v) => onUseReal(v === 'real')}
              options={[
                { value: 'real', label: 'Real', hint: 'Run the data-obfuscator program on the server' },
                { value: 'sim', label: 'Simulate', hint: 'Run a demo version in this browser only' },
              ]}
            />
          )}
          <button
            type="button"
            aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
            onClick={() => setTheme(dark ? 'light' : 'dark')}
            className="grid h-9 w-9 place-items-center rounded-lg border border-line-strong bg-surface text-muted hover:text-ink"
          >
            <Icon name={dark ? 'sun' : 'moon'} />
          </button>
        </div>
      </div>
    </header>
  );
}
