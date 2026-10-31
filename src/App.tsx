import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ColumnTable } from './components/ColumnTable';
import { CommandPreview } from './components/CommandPreview';
import { CsvViewer, useRowLimit } from './components/CsvViewer';
import { Dropzone } from './components/Dropzone';
import { Header } from './components/Header';
import { RunLauncher, RunMobileBar, RunOutput, useRunStart } from './components/RunPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { Button, Card, Icon, Tabs } from './components/ui';
import { brand, ui, type Sample } from '../app.config';
import { fetchEngine } from './lib/api';
import { formatBytes } from './lib/files';
import { useRun } from './lib/useRun';
import { parseDelimited } from './shared/csv';
import { uploadNames } from './shared/files';
import { defaultColumn, defaultOptions, validateOptions } from './shared/options';
import { effectCounts, planColumns } from './shared/plan';
import type { ColumnSetting, EngineInfo, Options } from './shared/types';

const SIM_MAX_MB = ui.simulationMaxMb;

const SIM: EngineInfo = { kind: 'simulation', version: '', detail: 'Simulation in this browser', maxUploadMb: SIM_MAX_MB };

export function App() {
  const [engine, setEngine] = useState<EngineInfo | null>(null);
  const [useReal, setUseReal] = useState(true);
  // One file is masked with `run`; two or more are masked together with `run2`.
  const [loaded, setLoaded] = useState<{ file: File; text: string }[]>([]);
  const [activeFile, setActiveFile] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [o, setO] = useState<Options>(() => defaultOptions());
  const [dataTab, setDataTab] = useState('data');
  const { limit: rowLimit, more: moreRows, reset: resetRows } = useRowLimit();
  const { state: run, start, cancel, reset } = useRun();
  const addInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void fetchEngine().then((e) => alive && setEngine(e));
    return () => {
      alive = false;
    };
  }, []);

  const active: EngineInfo = engine?.kind === 'real' && useReal ? engine : engine ? { ...SIM, maxUploadMb: SIM_MAX_MB } : SIM;
  const real = active.kind === 'real';

  const multi = loaded.length > 1;
  const names = useMemo(() => uploadNames(loaded.map((l) => l.file.name)), [loaded]);

  // what the user sees: the first rows of each file, parsed with the current reading options
  const tables = useMemo(
    () => loaded.map((l) => parseDelimited(l.text, { delimiter: o.delimiter, noHeader: !multi && o.noHeader, commentChars: o.commentChars, maxRows: ui.maxPreviewRows })),
    [loaded, multi, o.delimiter, o.noHeader, o.commentChars],
  );
  const table = tables[Math.min(activeFile, tables.length - 1)] ?? null;
  // every column name of every file, once, in order of first appearance (column settings apply by name)
  const headers = useMemo(() => {
    const all: string[] = [];
    for (const t of tables) for (const h of t.headers) if (!all.includes(h)) all.push(h);
    return all;
  }, [tables]);
  const where = useMemo(() => {
    const w: Record<string, number[]> = {};
    tables.forEach((t, i) => t.headers.forEach((h) => (w[h] = [...(w[h] ?? []), i])));
    return w;
  }, [tables]);
  const firstValue = useMemo(() => {
    const v: Record<string, string> = {};
    for (const t of tables) {
      t.headers.forEach((h, j) => {
        if (v[h]) return;
        for (const r of t.rows) {
          const x = r[j];
          if (x && x.trim() && x.trim() !== '.') {
            v[h] = x;
            break;
          }
        }
      });
    }
    return v;
  }, [tables]);
  const totalBytes = loaded.reduce((a, l) => a + l.file.size, 0);

  // keep the per-column settings in step with the columns of the file
  useEffect(() => {
    setO((prev) => {
      const same = headers.length === Object.keys(prev.columns).length && headers.every((h) => h in prev.columns);
      if (same) return prev;
      const columns: Record<string, ColumnSetting> = {};
      for (const h of headers) columns[h] = prev.columns[h] ?? defaultColumn();
      return { ...prev, columns };
    });
  }, [headers]);

  // several datasets: levels 1 to 3 only
  useEffect(() => {
    if (multi) setO((p) => (p.level >= 4 ? { ...p, level: 3 } : p));
  }, [multi]);

  const set = useCallback((patch: Partial<Options>) => setO((p) => ({ ...p, ...patch })), []);
  const setColumn = useCallback((name: string, patch: Partial<ColumnSetting>) => setO((p) => ({ ...p, columns: { ...p.columns, [name]: { ...(p.columns[name] ?? defaultColumn()), ...patch } } })), []);
  const setAllKeep = useCallback((keep: boolean) => setO((p) => ({ ...p, columns: Object.fromEntries(Object.entries(p.columns).map(([k, v]) => [k, { ...v, keep }])) })), []);

  // Check one file and read the start of it for the preview. Returns null (and sets the error) if it cannot be used.
  const readFile = useCallback(
    async (f: File): Promise<{ file: File; text: string } | null> => {
      const limit = (active.kind === 'real' ? active.maxUploadMb : SIM_MAX_MB) * 1024 * 1024;
      if (f.size > limit) {
        setLoadError(`${f.name} is ${formatBytes(f.size)}. The limit is ${Math.round(limit / 1024 / 1024)} MB${active.kind === 'real' ? '' : ' for the browser simulation'}.`);
        return null;
      }
      if (f.size === 0) {
        setLoadError(`${f.name} is empty.`);
        return null;
      }
      try {
        const text = await f.slice(0, ui.previewBytes).text();
        if (text.includes('\u0000')) {
          setLoadError(`${f.name} does not look like a text file. Export the dataset as CSV or TSV first.`);
          return null;
        }
        if (parseDelimited(text, { maxRows: 3 }).headers.length < 2) {
          setLoadError(`${f.name} has fewer than two columns. Check that it is a delimited text file.`);
          return null;
        }
        return { file: f, text };
      } catch {
        setLoadError(`Could not read ${f.name}.`);
        return null;
      }
    },
    [active],
  );

  /** Start with these files (replacing any loaded ones), optionally with the options an example asks for. */
  const loadFiles = useCallback(
    async (fs: File[], preset?: Sample['preset']) => {
      setLoadError('');
      if (fs.length > ui.maxFiles) {
        setLoadError(`At most ${ui.maxFiles} datasets can be masked in one run.`);
        return;
      }
      if (active.kind !== 'real' && fs.reduce((a, f) => a + f.size, 0) > SIM_MAX_MB * 1024 * 1024) {
        setLoadError(`Together the files are larger than ${SIM_MAX_MB} MB, the limit of the browser simulation.`);
        return;
      }
      const read: { file: File; text: string }[] = [];
      for (const f of fs) {
        const r = await readFile(f);
        if (!r) return;
        read.push(r);
      }
      const heads: string[] = [];
      for (const r of read) for (const h of parseDelimited(r.text, { maxRows: 3 }).headers) if (!heads.includes(h)) heads.push(h);
      const opts = defaultOptions(heads);
      if (preset) {
        opts.level = preset.level;
        opts.seed = preset.seed;
        for (const [col, role] of Object.entries(preset.roles)) if (col in opts.columns) opts.columns[col] = { ...opts.columns[col], role };
      }
      reset();
      setLoaded(read);
      setActiveFile(0);
      resetRows();
      setDataTab('data');
      setO(opts);
    },
    [active, readFile, reset, resetRows],
  );

  /** Add datasets to the ones already loaded; the run then becomes a `run2` run. */
  const addFiles = useCallback(
    async (fs: File[]) => {
      setLoadError('');
      if (loaded.length + fs.length > ui.maxFiles) {
        setLoadError(`At most ${ui.maxFiles} datasets can be masked in one run.`);
        return;
      }
      const read: { file: File; text: string }[] = [];
      for (const f of fs) {
        const r = await readFile(f);
        if (!r) return;
        read.push(r);
      }
      reset();
      setLoaded((prev) => [...prev, ...read]);
      setActiveFile(loaded.length);
      setDataTab('data');
    },
    [loaded.length, readFile, reset],
  );

  const removeFile = useCallback(
    (i: number) => {
      reset();
      setLoaded((prev) => prev.filter((_, k) => k !== i));
      setActiveFile(0);
    },
    [reset],
  );

  const loadSample = useCallback(
    async (s: Sample) => {
      try {
        const list = s.files ?? [s.file];
        const got = await Promise.all(
          list.map(async (name) => {
            const r = await fetch(`samples/${name}`);
            if (!r.ok) throw new Error();
            return new File([await r.blob()], name.split('/').pop() ?? name, { type: 'text/plain' });
          }),
        );
        await loadFiles(got, s.preset);
      } catch {
        setLoadError('Could not load the example file.');
      }
    },
    [loadFiles],
  );

  const clearFiles = useCallback(() => {
    reset();
    setLoaded([]);
    setActiveFile(0);
    setO(defaultOptions());
  }, [reset]);

  const problems = useMemo(() => (headers.length ? validateOptions(o, headers, multi) : []), [o, headers, multi]);
  const plans = useMemo(() => planColumns(headers, o, multi), [headers, o, multi]);
  const counts = useMemo(() => effectCounts(plans, o), [plans, o]);

  const canRun = loaded.length > 0 && !!table && problems.length === 0 && run.status !== 'running';
  const go = useRunStart({ start, engine: active, files: loaded.map((l) => l.file), tables, names, options: o, headers });

  const canToggle = engine?.kind === 'real';

  return (
    <div className="min-h-screen">
      <Header engine={engine} useReal={useReal} onUseReal={setUseReal} canToggle={canToggle} />
      {loaded.length === 0 || !table ? (
        <Dropzone onFiles={(f) => void loadFiles(f)} onSample={(s) => void loadSample(s)} engine={engine} useReal={useReal} error={loadError} />
      ) : (
        <main style={{ '--side-w': `${ui.sidePanelWidth}px` } as React.CSSProperties} className="mx-auto grid max-w-[1600px] items-start gap-x-6 gap-y-6 px-4 pb-24 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_var(--side-w)] lg:pb-6">
          <div className="min-w-0 space-y-6">
            <Card
              title={
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Icon name={multi ? 'layers' : 'sheet'} className="text-muted" />
                  {multi ? (
                    <>
                      <span className="text-sm font-bold">{loaded.length} datasets, masked together</span>
                      <span className="text-[13px] font-normal text-muted">
                        {headers.length} distinct columns · {formatBytes(totalBytes)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-sm">{loaded[0].file.name}</span>
                      <span className="text-[13px] font-normal text-muted">
                        {table.totalRows.toLocaleString()}
                        {loaded[0].text.length >= ui.previewBytes || loaded[0].file.size > ui.previewBytes ? '+' : ''} rows · {headers.length} columns · {formatBytes(loaded[0].file.size)} · {table.delimiter}-separated
                      </span>
                    </>
                  )}
                </span>
              }
              aside={
                <span className="flex items-center gap-1.5">
                  {loaded.length < ui.maxFiles && (
                    <>
                      <Button size="sm" variant="ghost" icon="plus" onClick={() => addInput.current?.click()} disabled={run.status === 'running'}>
                        Add datasets
                      </Button>
                      <input
                        ref={addInput}
                        type="file"
                        multiple
                        accept=".csv,.tsv,.txt,.dat,.prn,text/*"
                        className="sr-only"
                        aria-label="Add more dataset files"
                        onChange={(e) => {
                          const picked = [...(e.target.files ?? [])];
                          if (picked.length) void addFiles(picked);
                          e.target.value = '';
                        }}
                      />
                    </>
                  )}
                  <Button size="sm" variant="ghost" icon="x" onClick={clearFiles} disabled={run.status === 'running'}>
                    Use other files
                  </Button>
                </span>
              }
            >
              {loadError && (
                <p role="alert" className="mx-4 mt-4 rounded-md bg-bad-soft px-3 py-2 text-sm font-medium text-bad">
                  {loadError}
                </p>
              )}
              <Tabs
                label="Input data"
                active={dataTab}
                onChange={setDataTab}
                tabs={[
                  { id: 'data', label: 'Data preview', note: `${Math.min(rowLimit, table.rows.length)} of ${table.totalRows.toLocaleString()} rows` },
                  { id: 'columns', label: 'Column settings', note: `${headers.length - counts.drop} of ${headers.length} kept` },
                ]}
              />
              {dataTab === 'data' ? (
                <CsvViewer tables={tables} names={names} active={activeFile} onActive={setActiveFile} onRemove={removeFile} plans={plans} o={o} rowLimit={rowLimit} onMoreRows={moreRows} running={run.status === 'running'} />
              ) : (
                <div role="tabpanel" id="panel-columns" aria-labelledby="tab-columns" className="space-y-3 p-4">
                  <p className="text-[13px] text-muted">
                    {multi ? 'Settings apply to a column by name in every dataset that has it. Untick a column to remove it from all of them.' : 'Untick a column to remove it. Change how a column is treated if its name was not recognised.'} Only the choices that do something at level {o.level} are listed.
                  </p>
                  <ColumnTable headers={headers} firstValue={firstValue} where={multi ? where : undefined} datasetNames={names} o={o} setColumn={setColumn} setAllKeep={setAllKeep} />
                </div>
              )}
            </Card>

            <RunOutput run={run} onCancel={cancel} onReset={reset} />
          </div>

          <aside className="min-w-0 lg:col-start-2 lg:row-start-1">
            <div className="space-y-4 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-84px)] lg:overflow-y-auto lg:pr-1 scroll-thin">
              <RunLauncher status={run.status} canRun={canRun} problems={problems} real={real} multi={multi} onRun={go} />
              <SettingsPanel o={o} set={set} headers={headers} multi={multi} />
              <CommandPreview o={o} headers={headers} fileNames={names} />
            </div>
          </aside>

          <RunMobileBar status={run.status} canRun={canRun} onRun={go} />
        </main>
      )}
      <footer className="mx-auto max-w-[1600px] px-4 pb-10 pt-4 text-[13px] text-faint sm:px-6">
        {brand.footer}
      </footer>
    </div>
  );
}
