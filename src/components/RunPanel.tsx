/**
 * The program-run panel: everything about starting a run and watching it.
 *
 *   - useRunStart()  turns the loaded files and the chosen options into a run (real program or simulation)
 *   - <RunLauncher/> the "Obfuscate data" card at the top of the side panel (button, problem list, what-will-happen note)
 *   - <RunMobileBar/> the same button fixed to the bottom of the screen on small displays
 *   - <RunOutput/>   the live output under the data: progress steps and program log (RunConsole), then the result tabs (Results);
 *                    it scrolls itself into view when a run starts
 *
 * App.tsx owns the run state (useRun) and the loaded files; it passes them in.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { RunState, SourceDataset } from '../lib/useRun';
import type { EngineInfo, Options, ParsedTable } from '../shared/types';
import { Results } from './Results';
import { RunConsole } from './RunConsole';
import { Button, Icon } from './ui';

type StartRun = (args: { engine: EngineInfo; files: File[]; options: Options; headers: string[]; datasets: SourceDataset[] }) => Promise<void>;

/** Returns the function that starts a run with everything currently loaded. */
export function useRunStart(args: { start: StartRun; engine: EngineInfo; files: File[]; tables: ParsedTable[]; names: string[]; options: Options; headers: string[] }) {
  const { start, engine, files, tables, names, options, headers } = args;
  return useCallback(() => {
    if (!files.length) return;
    const datasets: SourceDataset[] = tables.map((tb, i) => ({ name: names[i], headers: tb.headers, rows: tb.rows }));
    void start({ engine, files, options, headers, datasets });
  }, [files, tables, names, start, engine, options, headers]);
}

interface LauncherProps {
  status: RunState['status'];
  canRun: boolean;
  /** Reasons the options cannot be run yet; the first one is shown. */
  problems: string[];
  /** true when the real program will run, false for the in-browser simulation */
  real: boolean;
  /** several datasets (run2) rather than one file (run) */
  multi: boolean;
  onRun: () => void;
}

const label = (status: RunState['status'], long: boolean) => (status === 'running' ? 'Obfuscating…' : status === 'done' && long ? 'Obfuscate again' : 'Obfuscate data');

export function RunLauncher({ status, canRun, problems, real, multi, onRun }: LauncherProps) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <Button variant="primary" size="lg" icon="play" className="w-full" disabled={!canRun} onClick={onRun}>
        {label(status, true)}
      </Button>
      {problems.length > 0 ? (
        <p role="alert" className="mt-3 flex gap-2 text-[13px] text-bad">
          <Icon name="warn" size={15} className="mt-0.5 shrink-0" />
          {problems[0]}
        </p>
      ) : (
        <p className="mt-3 text-[13px] leading-snug text-muted">
          {real ? `Runs ${multi ? 'run2 of the' : 'the'} data-obfuscator program on the server. The uploaded ${multi ? 'files are' : 'file is'} deleted when the run ends.` : 'Runs a demonstration in this browser. The masking follows the same rules, but it is not a substitute for the real program.'}
        </p>
      )}
    </div>
  );
}

export function RunMobileBar({ status, canRun, onRun }: Pick<LauncherProps, 'status' | 'canRun' | 'onRun'>) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 backdrop-blur lg:hidden">
      <Button variant="primary" size="lg" icon="play" className="w-full" disabled={!canRun} onClick={onRun}>
        {label(status, false)}
      </Button>
    </div>
  );
}

export function RunOutput({ run, onCancel, onReset }: { run: RunState; onCancel: () => void; onReset: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // bring the live output into view when a run starts
  useEffect(() => {
    if (run.status === 'running') ref.current?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  }, [run.status]);

  if (run.status === 'idle') return null;
  return (
    <div ref={ref} className="scroll-mt-[72px] space-y-6">
      <RunConsole run={run} onCancel={onCancel} />
      {run.status === 'done' && run.snapshot && <Results key={run.finishedAt} run={run} onReset={onReset} />}
    </div>
  );
}
