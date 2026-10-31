import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ui } from '../../app.config';
import { looksLikeNumber } from '../shared/detect';
import { Icon } from './ui';

export function colLetter(i: number): string {
  let s = '';
  let n = i;
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

export interface ColMeta {
  /** Small tag under the column name, e.g. "date" */
  tag?: string;
  tone?: 'mask' | 'safe' | 'warn' | 'dim' | 'plain';
  dropped?: boolean;
}

const TONE: Record<NonNullable<ColMeta['tone']>, string> = {
  mask: 'text-mask-ink bg-mask-soft',
  safe: 'text-safe bg-safe-soft',
  warn: 'text-warn bg-warn-soft',
  dim: 'text-faint bg-transparent',
  plain: 'text-muted bg-transparent',
};

interface GridProps {
  headers: string[];
  rows: string[][];
  meta?: (ColMeta | undefined)[];
  /** Highlight cells that differ from the original (masked view). */
  changed?: (r: number, c: number) => boolean;
  scanning?: boolean;
  maxHeight?: number;
  footer?: ReactNode;
  caption: string;
}

const Row = memo(function Row({ r, row, n, changed, selCol, onPick, numeric }: { r: number; row: string[]; n: number; changed?: (r: number, c: number) => boolean; selCol: number; onPick: (c: number) => void; numeric: boolean[] }) {
  const cells = [];
  for (let c = 0; c < n; c++) {
    const v = row[c] ?? '';
    const isChanged = changed?.(r, c) ?? false;
    cells.push(
      <td key={c} className={`${numeric[c] ? 'num' : ''} ${isChanged ? 'changed' : ''} ${selCol === c ? 'sel' : ''}`} onClick={() => onPick(c)} title={v}>
        {v === '' ? ' ' : v}
      </td>,
    );
  }
  return (
    <tr>
      <td className="gutter">{r + 1}</td>
      {cells}
    </tr>
  );
});

export function Grid(props: GridProps) {
  const [sel, setSel] = useState<{ r: number; c: number } | null>(null);
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [full]);

  const sheet = (fill: boolean) => <Sheet {...props} sel={sel} setSel={setSel} fill={fill} onToggleFull={() => setFull((v) => !v)} isFull={fill} />;

  return (
    <>
      {full ? <div className="h-[120px] rounded-lg border border-dashed border-line-strong bg-sunken" aria-hidden="true" /> : sheet(false)}
      {full &&
        createPortal(
          <div role="dialog" aria-modal="true" aria-label={props.caption} className="fixed inset-0 z-50 flex flex-col gap-3 bg-canvas p-3 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-bold tracking-tight">{props.caption}</h2>
              <span className="hidden text-[13px] text-muted sm:inline">Press Esc to close</span>
            </div>
            <div className="min-h-0 flex-1">{sheet(true)}</div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Sheet({ headers, rows, meta, changed, scanning, maxHeight = ui.gridMaxHeight, footer, caption, sel, setSel, fill, onToggleFull, isFull }: GridProps & { sel: { r: number; c: number } | null; setSel: (v: { r: number; c: number } | null) => void; fill: boolean; onToggleFull: () => void; isFull: boolean }) {
  const numeric = useMemo(() => headers.map((_, c) => rows.slice(0, 30).every((r) => (r[c] ?? '').trim() === '' || r[c] === '.' || looksLikeNumber(r[c] ?? ''))), [headers, rows]);
  const value = sel ? (rows[sel.r]?.[sel.c] ?? '') : '';

  return (
    <div className={`flex flex-col overflow-hidden rounded-lg border border-line-strong bg-surface ${fill ? 'h-full' : ''}`}>
      {/* formula bar */}
      <div className="flex items-center border-b border-line bg-sunken font-mono text-[12.5px]">
        <div className="w-24 shrink-0 border-r border-line px-3 py-1.5 text-center font-semibold text-ink" aria-live="polite">
          {sel ? `${colLetter(sel.c)}${sel.r + 1}` : '\u2014'}
        </div>
        <div className="px-3 text-faint italic">fx</div>
        <div className="min-w-0 flex-1 truncate py-1.5 pr-3 text-ink">{sel ? value || <span className="text-faint">(empty)</span> : <span className="text-faint">Select a cell to see its value</span>}</div>
        <button
          type="button"
          onClick={onToggleFull}
          title={isFull ? 'Close full-page view' : 'Enlarge to full page'}
          className="flex shrink-0 items-center gap-1.5 border-l border-line px-3 py-1.5 font-sans text-[13px] font-semibold text-muted hover:bg-surface hover:text-ink"
        >
          <Icon name={isFull ? 'collapse' : 'expand'} size={14} />
          {isFull ? 'Close' : 'Enlarge'}
        </button>
      </div>
      <div className={`scroll-thin relative overflow-auto ${fill ? 'min-h-0 flex-1' : ''} ${scanning ? 'scanline' : ''}`} style={fill ? undefined : { maxHeight }}>
        <table className="sheet min-w-full" aria-label={caption}>
          <thead>
            <tr className="letters">
              <th className="gutter" aria-hidden="true" />
              {headers.map((_, c) => (
                <th key={c} aria-hidden="true">
                  {colLetter(c)}
                </th>
              ))}
            </tr>
            <tr className="names">
              <th className="gutter" aria-hidden="true" />
              {headers.map((h, c) => {
                const m = meta?.[c];
                return (
                  <th key={c} scope="col" title={h} className={m?.dropped ? 'opacity-45' : ''}>
                    <span className={`block truncate ${m?.dropped ? 'line-through' : ''}`}>{h}</span>
                    {m?.tag && <span className={`mt-px inline-block rounded px-1 text-[10.5px] font-medium leading-4 ${TONE[m.tone ?? 'plain']}`}>{m.tag}</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <Row key={r} r={r} row={row} n={headers.length} changed={changed} selCol={sel && sel.r === r ? sel.c : -1} onPick={(c) => setSel({ r, c })} numeric={numeric} />
            ))}
          </tbody>
        </table>
      </div>
      {footer && <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line bg-sunken px-3 py-2 text-[13px] text-muted">{footer}</div>}
    </div>
  );
}
