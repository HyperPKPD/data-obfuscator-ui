import { useMemo, useState } from 'react';
import { ui } from '../../app.config';
import { downloadText, downloadZip, formatBytes } from '../lib/files';
import type { RunState } from '../lib/useRun';
import { parseDelimited } from '../shared/csv';
import { maskedMatch } from '../shared/files';
import { isDropped, planColumns } from '../shared/plan';
import type { ResultFile } from '../shared/types';
import { Grid, type ColMeta } from './Grid';
import { Badge, Button, CopyButton, Icon, Tabs, type TabDef } from './ui';

const TAB_LABEL: Record<string, string> = {
  'llm.txt': 'LLM prompts',
  'llm2.txt': 'LLM prompts',
  'keymap2.txt': 'Key map',
  'summary2.txt': 'Summary',
  'run2.log': 'Log',
  'tokens.txt': 'Tokens',
  'keymap.txt': 'Key map',
  'summary.txt': 'Summary',
  'column_report.txt': 'Column report',
  'config.used.txt': 'Options used',
  'obfuscator.log': 'Log',
};
const ORDER = ['llm.txt', 'llm2.txt', 'tokens.txt', 'keymap.txt', 'keymap2.txt', 'summary.txt', 'summary2.txt', 'column_report.txt', 'config.used.txt', 'obfuscator.log', 'run2.log'];

const isDataset = (name: string) => /^obfuscated\./.test(name) || /\.(csv|tsv|dat)$/.test(name);
const isMasked2 = (name: string) => /_masked(_\d+)?\.(csv|tsv|dat)$/.test(name);

export function Results({ run, onReset }: { run: RunState; onReset: () => void }) {
  const files = run.files;
  const multi = run.snapshot?.command === 'run2';
  // `run` writes one dataset; `run2` writes one masked file per input
  const datasets = useMemo(() => (multi ? files.filter((f) => isMasked2(f.name)) : files.filter((f) => isDataset(f.name)).slice(0, 1)), [files, multi]);
  const dataset = datasets[0];
  const tabs: TabDef[] = useMemo(() => {
    const t: TabDef[] = [];
    if (dataset) t.push({ id: dataset.name, label: multi ? 'Masked data' : 'Masked data', note: multi ? `${datasets.length} files` : formatBytes(dataset.size) });
    for (const n of ORDER) {
      const f = files.find((x) => x.name === n);
      if (f) t.push({ id: n, label: TAB_LABEL[n], note: formatBytes(f.size) });
    }
    return t;
  }, [files, dataset, datasets.length, multi]);
  const [active, setActive] = useState<string>(() => tabs[0]?.id ?? '');
  const [pickedData, setPickedData] = useState(0);
  const isDataTab = !!dataset && (active === dataset.name || datasets.some((d) => d.name === active));
  const current = isDataTab ? datasets[Math.min(pickedData, datasets.length - 1)] : files.find((f) => f.name === (tabs.some((t) => t.id === active) ? active : tabs[0]?.id));
  if (!current) return null;
  const tabId = isDataTab ? dataset.name : current.name;

  const isKeymap = current.name === 'keymap.txt' || current.name === 'keymap2.txt';
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-bold tracking-tight">Result</h2>
          <Badge tone="safe">
            <Icon name="check" size={12} />
            {files.length} files
          </Badge>
          {run.warnings > 0 && <Badge tone="warn">{run.warnings} warning{run.warnings > 1 ? 's' : ''}, see the log</Badge>}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" icon="download" onClick={() => downloadZip(files, multi ? 'masked-datasets.zip' : `masked-${(run.snapshot?.fileName ?? 'dataset').replace(/\.[^.]+$/, '')}.zip`)}>
            Download all (zip)
          </Button>
          <Button size="sm" variant="ghost" icon="reset" onClick={onReset}>
            Start over
          </Button>
        </div>
      </div>
      <Tabs tabs={tabs} active={tabId} onChange={setActive} label="Output files" />
      <div role="tabpanel" id={`panel-${tabId}`} aria-labelledby={`tab-${tabId}`} className="bg-surface p-4">
        {isKeymap && (
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-2.5 text-sm text-warn">
            <Icon name="lock" className="mt-0.5 shrink-0" />
            <span>
              <strong>Keep this file offline.</strong> With the masked data, it reverses the masking. Never paste it into an LLM or send it to anyone.
            </span>
          </div>
        )}
        {isDataTab ? (
          <>
            {multi && (
              <div role="tablist" aria-label="Masked datasets" className="mb-3 flex flex-wrap gap-1.5">
                {datasets.map((d, i) => (
                  <button key={d.name} type="button" role="tab" aria-selected={i === pickedData} onClick={() => setPickedData(i)} className={`rounded-lg border px-3 py-1 font-mono text-[13px] font-semibold ${i === pickedData ? 'border-brand bg-sunken text-ink' : 'border-line text-muted hover:border-line-strong'}`}>
                    {d.name}
                  </button>
                ))}
              </div>
            )}
            <DatasetView key={current.name} run={run} file={current} />
          </>
        ) : /^llm2?\.txt$/.test(current.name) ? (
          <PromptView file={current} />
        ) : (
          <TextView file={current} />
        )}
      </div>
    </div>
  );
}

function Actions({ file }: { file: ResultFile }) {
  return (
    <div className="flex gap-2">
      <CopyButton text={file.text ?? ''} />
      <Button size="sm" icon="download" onClick={() => downloadText(file.name, file.text ?? '')}>
        Download {file.name}
      </Button>
    </div>
  );
}

function TextView({ file }: { file: ResultFile }) {
  const text = file.text ?? '';
  const shown = text.length > 400_000 ? text.slice(0, 400_000) + '\n\n… (shortened here, download the file for everything)' : text;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-[13px] text-muted">
          {file.name} · {text.split('\n').length - 1} lines
        </span>
        <Actions file={file} />
      </div>
      <pre className="scroll-thin max-h-[560px] overflow-auto rounded-lg border border-line bg-sunken p-4 font-mono text-[12.5px] leading-[1.6] text-ink">{shown}</pre>
    </div>
  );
}

/** Splits the prompt file into an introduction, the prompts and trailing notes. Understands `run` (`1. TITLE` + a dashed line) and `run2` (`## Prompt 1 - title`). */
function splitPrompts(text: string): { intro: string; prompts: { title: string; body: string }[]; notes: string } | null {
  const lines = text.split('\n');
  const isH2 = (l: string) => /^## /.test(l);
  const run2Heads = lines.map((l, i) => (/^## Prompt \d+ - /.test(l) ? i : -1)).filter((i) => i >= 0);
  if (run2Heads.length) {
    const prompts = run2Heads.map((h) => {
      let end = lines.length;
      for (let k = h + 1; k < lines.length; k++) if (isH2(lines[k])) { end = k; break; }
      return { title: lines[h].replace(/^## Prompt \d+ - /, ''), body: lines.slice(h + 1, end).join('\n').trim(), end };
    });
    const lastEnd = prompts[prompts.length - 1].end;
    return {
      intro: lines.slice(0, run2Heads[0]).join('\n').trim(),
      prompts: prompts.map(({ title, body }) => ({ title: title.replace(/^./, (c) => c.toUpperCase()), body })),
      notes: lines.slice(lastEnd).join('\n').trim(),
    };
  }
  const heads: { i: number; title: string }[] = [];
  lines.forEach((l, i) => {
    if (/^\d+\. [A-Z]/.test(l) && /^-{3,}$/.test(lines[i + 1] ?? '')) heads.push({ i, title: l });
  });
  if (!heads.length) return null;
  return {
    intro: lines.slice(0, heads[0].i).join('\n').trim(),
    prompts: heads.map((h, k) => ({
      title: h.title.replace(/^\d+\. /, '').toLowerCase().replace(/^./, (c) => c.toUpperCase()).replace(/nonmem/i, 'NONMEM'),
      body: lines.slice(h.i + 2, heads[k + 1]?.i ?? lines.length).join('\n').trim(),
    })),
    notes: '',
  };
}

function PromptView({ file }: { file: ResultFile }) {
  const text = file.text ?? '';
  const parts = useMemo(() => splitPrompts(text), [text]);
  if (!parts) return <TextView file={file} />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">Attach the masked data to your chat, then paste one prompt.</span>
        <Actions file={file} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <pre className="scroll-thin max-h-[520px] overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-sunken p-4 font-mono text-[12.5px] leading-[1.6]">{parts.intro}</pre>
        <div className="space-y-3">
          {parts.prompts.map((p) => (
            <div key={p.title} className="rounded-lg border border-line">
              <div className="flex items-center justify-between gap-2 border-b border-line bg-sunken px-3.5 py-2">
                <h3 className="text-sm font-bold">{p.title}</h3>
                <CopyButton text={p.body} label="Copy prompt" />
              </div>
              <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap p-3.5 font-mono text-[12.5px] leading-[1.6]">{p.body}</pre>
            </div>
          ))}
          {parts.notes && <pre className="scroll-thin max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-sunken p-3.5 font-mono text-[12.5px] leading-[1.6] text-muted">{parts.notes}</pre>}
        </div>
      </div>
    </div>
  );
}

function DatasetView({ run, file }: { run: RunState; file: ResultFile }) {
  const [compare, setCompare] = useState(true);
  const [limit, setLimit] = useState<number>(ui.resultRows.initial);
  const snap = run.snapshot!;
  const multi = snap.command === 'run2';
  const parsed = useMemo(() => parseDelimited(file.text ?? '', { delimiter: 'auto', maxRows: ui.maxPreviewRows }), [file.text]);
  // the dataset this masked file came from (one for `run`, matched by name for `run2`)
  const source = useMemo(() => (multi ? snap.datasets.find((d) => maskedMatch(file.name, d.name)) : snap.datasets[0]), [multi, snap, file.name]);
  const srcHeaders = source?.headers ?? snap.headers;
  const plans = useMemo(() => planColumns(srcHeaders, snap.options, multi), [srcHeaders, snap, multi]);
  // output column j -> original column index (dropped columns are skipped, order is kept)
  const mapping = useMemo(() => plans.filter((p) => !isDropped(p, snap.options)).map((p) => p.index), [plans, snap.options]);
  const original = source?.rows ?? [];
  const canCompare = original.length > 0 && mapping.length === parsed.headers.length;
  const changed = compare && canCompare ? (r: number, c: number) => (original[r]?.[mapping[c]] ?? '') !== (parsed.rows[r]?.[c] ?? '') : undefined;

  const meta: ColMeta[] = parsed.headers.map((h, c) => {
    const src = srcHeaders[mapping[c]];
    const renamed = canCompare && src !== h;
    return renamed ? { tag: `was ${src}`, tone: 'mask' } : {};
  });

  const shownRows = parsed.rows.slice(0, limit);
  const diffCount = useMemo(() => {
    if (!canCompare) return 0;
    let n = 0;
    for (let r = 0; r < Math.min(original.length, parsed.rows.length, limit); r++) for (let c = 0; c < parsed.headers.length; c++) if ((original[r]?.[mapping[c]] ?? '') !== (parsed.rows[r]?.[c] ?? '')) n++;
    return n;
  }, [canCompare, original, parsed, mapping, limit]);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className={`inline-flex items-center gap-2 text-sm font-medium ${canCompare ? '' : 'opacity-50'}`}>
          <input type="checkbox" className="h-4 w-4 accent-[var(--mask)]" checked={compare && canCompare} disabled={!canCompare} onChange={(e) => setCompare(e.target.checked)} />
          Highlight what changed
          {compare && canCompare && <Badge tone="mask">{diffCount} cells in these rows</Badge>}
        </label>
        <Actions file={file} />
      </div>
      {snap.options.level >= 4 && canCompare && <p className="mb-2 text-[13px] text-muted">At level 4 rows are ordered by masked ID, so highlights compare each row with the original at the same position.</p>}
      <Grid
        caption="Masked dataset"
        headers={parsed.headers}
        rows={shownRows}
        meta={meta}
        changed={changed}
        maxHeight={ui.resultGridMaxHeight}
        footer={
          <>
            <span>
              Showing {shownRows.length} of {parsed.totalRows.toLocaleString()} rows
            </span>
            {limit < Math.min(parsed.rows.length, ui.maxPreviewRows) && (
              <Button size="sm" variant="ghost" onClick={() => setLimit((n) => Math.min(n + ui.resultRows.step, ui.maxPreviewRows))}>
                Show more rows
              </Button>
            )}
          </>
        }
      />
    </div>
  );
}
