/**
 * The CSV viewer: everything the "Data preview" tab shows.
 *
 *   - the dataset selector (when several datasets are loaded, with a remove button on each)
 *   - the badges that count what the chosen level will mask, protect or remove
 *   - the Excel-style grid with a tag under every column header ("recoded", "date shift", ...)
 *   - the row counter and the "Show more rows" button
 *
 * App.tsx only loads the files and parses them; it hands the parsed tables and the options to <CsvViewer />.
 * The spreadsheet grid itself (selection, formula bar, enlarge view) lives in Grid.tsx and is also used by the results.
 */
import { useCallback, useMemo, useState } from 'react';
import { ui } from '../../app.config';
import { effectCounts, effectOf, type ColumnPlan } from '../shared/plan';
import type { Options, ParsedTable } from '../shared/types';
import { Grid, type ColMeta } from './Grid';
import { Badge, Button, Icon } from './ui';

/** How many preview rows are showing, and how to show more. Lives in App so the choice survives a switch to another tab. */
export function useRowLimit() {
  const [limit, setLimit] = useState<number>(ui.inputRows.initial);
  const more = useCallback(() => setLimit((n) => Math.min(n + ui.inputRows.step, ui.maxPreviewRows)), []);
  const reset = useCallback(() => setLimit(ui.inputRows.initial), []);
  return { limit, more, reset };
}

/** The small tag shown under each column name: what the chosen level does to that column. */
export function columnTags(headers: string[], planByName: Map<string, ColumnPlan>, o: Options): ColMeta[] {
  return headers.map((h) => {
    const p = planByName.get(h);
    const fx = p ? effectOf(p, o) : { kind: 'pass' as const, text: '' };
    switch (fx.kind) {
      case 'recode':
        return { tag: 'recoded', tone: 'mask' as const };
      case 'shift':
        return { tag: 'date shift', tone: 'mask' as const };
      case 'redact':
        return { tag: 'redacted', tone: 'mask' as const };
      case 'scale':
        return { tag: 'scaled', tone: 'mask' as const };
      case 'protect':
        return { tag: 'protected', tone: 'safe' as const };
      case 'drop':
        return { tag: 'removed', tone: 'dim' as const, dropped: true };
      default:
        return {};
    }
  });
}

export interface CsvViewerProps {
  /** The parsed start of every loaded file. */
  tables: ParsedTable[];
  /** Unique display names of the files, same order as `tables`. */
  names: string[];
  active: number;
  onActive: (i: number) => void;
  onRemove: (i: number) => void;
  /** Per-column plan (by name) and the options, to tag the columns. */
  plans: ColumnPlan[];
  o: Options;
  rowLimit: number;
  onMoreRows: () => void;
  /** A run is in progress: the grid shows its scanning effect and datasets cannot be removed. */
  running: boolean;
}

export function CsvViewer({ tables, names, active, onActive, onRemove, plans, o, rowLimit, onMoreRows, running }: CsvViewerProps) {
  const multi = tables.length > 1;
  const table = tables[Math.min(active, tables.length - 1)];
  const planByName = useMemo(() => new Map(plans.map((p) => [p.name, p])), [plans]);
  const meta = useMemo(() => columnTags(table?.headers ?? [], planByName, o), [table, planByName, o]);
  const counts = useMemo(() => effectCounts(plans, o), [plans, o]);
  if (!table) return null;

  return (
    <div role="tabpanel" id="panel-data" aria-labelledby="tab-data" className="space-y-3 p-4">
      {multi && (
        <div role="tablist" aria-label="Datasets" className="flex flex-wrap gap-1.5">
          {names.map((n, i) => (
            <span key={n} className={`inline-flex items-center rounded-lg border text-[13px] font-semibold ${i === active ? 'border-brand bg-sunken text-ink' : 'border-line text-muted hover:border-line-strong'}`}>
              <button type="button" role="tab" aria-selected={i === active} onClick={() => onActive(i)} className="rounded-l-lg py-1 pl-3 pr-2 font-mono">
                {n}
              </button>
              <button type="button" aria-label={`Remove ${n}`} title={`Remove ${n}`} onClick={() => onRemove(i)} disabled={running} className="grid h-full place-items-center rounded-r-lg px-1.5 py-1 text-faint hover:text-bad disabled:opacity-40">
                <Icon name="x" size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
        <span>The column tags show what the chosen level will do to each column.</span>
        {counts.change > 0 && <Badge tone="mask">{counts.change} masked</Badge>}
        {counts.protect > 0 && <Badge tone="safe">{counts.protect} protected</Badge>}
        {counts.drop > 0 && <Badge tone="bad">{counts.drop} removed</Badge>}
      </div>
      <Grid
        caption={multi ? `Preview of ${names[active]}` : 'Preview of your dataset'}
        headers={table.headers}
        rows={table.rows.slice(0, rowLimit)}
        meta={meta}
        scanning={running}
        footer={
          <>
            <span>
              Showing {Math.min(rowLimit, table.rows.length)} of {table.totalRows.toLocaleString()} rows
            </span>
            {rowLimit < Math.min(table.rows.length, ui.maxPreviewRows) && (
              <Button size="sm" variant="ghost" onClick={onMoreRows}>
                Show more rows
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}
