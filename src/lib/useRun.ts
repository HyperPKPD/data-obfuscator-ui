import { useCallback, useEffect, useRef, useState } from 'react';
import { simulation, ui } from '../../app.config';
import { simulate } from '../shared/mockEngine';
import { simulateRun2 } from '../shared/mockRun2';
import { STEP_ORDER } from '../shared/steps';
import type { EngineInfo, Options, ResultFile, RunCommand, RunEvent, RunStep } from '../shared/types';
import { deleteJob, runOnServer } from './api';

export interface LogEntry {
  id: number;
  level: 'info' | 'ok' | 'warn' | 'error' | 'debug' | 'plain';
  text: string;
}

/** A dataset as the user loaded it (the rows shown in the preview), kept to compare with the masked result. */
export interface SourceDataset {
  name: string;
  headers: string[];
  rows: string[][];
}

export type RunStatus = 'idle' | 'running' | 'done' | 'failed';

export interface RunState {
  status: RunStatus;
  mode: 'real' | 'simulation' | null;
  logs: LogEntry[];
  steps: RunStep[];
  files: ResultFile[];
  warnings: number;
  error: string;
  startedAt: number;
  finishedAt: number;
  /** Snapshot of what was run, so the result tabs stay consistent if the user keeps editing. */
  snapshot: { options: Options; headers: string[]; command: RunCommand; datasets: SourceDataset[]; fileName: string } | null;
}

const EMPTY: RunState = {
  status: 'idle',
  mode: null,
  logs: [],
  steps: [],
  files: [],
  warnings: 0,
  error: '',
  startedAt: 0,
  finishedAt: 0,
  snapshot: null,
};

export function useRun() {
  const [state, setState] = useState<RunState>(EMPTY);
  const abort = useRef<AbortController | null>(null);
  const jobId = useRef<string | null>(null);
  const pending = useRef<RunEvent[]>([]);
  const frame = useRef(0);
  const stopPacer = () => {
    clearInterval(frame.current);
    frame.current = 0;
    pending.current = [];
  };
  const counter = useRef(0);

  const apply = useCallback((events: RunEvent[]) => {
    setState((s) => {
      let next = s;
      for (const e of events) {
        if (e.type === 'log') {
          next = { ...next, logs: [...next.logs, { id: counter.current++, level: e.level, text: e.text }] };
        } else if (e.type === 'step') {
          if (!next.steps.includes(e.step)) next = { ...next, steps: [...next.steps, e.step] };
        } else if (e.type === 'done') {
          next = { ...next, status: 'done', files: e.files, warnings: e.warnings, finishedAt: Date.now(), steps: STEP_ORDER };
        } else if (e.type === 'fail') {
          next = { ...next, status: 'failed', error: e.message, finishedAt: Date.now() };
        }
      }
      return next;
    });
  }, []);

  // The real program finishes in milliseconds. Events are queued and released at a readable pace
  // (a long backlog is released faster), so the person can follow the run as it unfolds.
  const onEvent = useCallback(
    (e: RunEvent) => {
      pending.current.push(e);
      if (frame.current) return;
      frame.current = window.setInterval(() => {
        const q = pending.current;
        if (!q.length) {
          clearInterval(frame.current);
          frame.current = 0;
          return;
        }
        const n = Math.max(1, Math.ceil(q.length / ui.logPacing.backlogDivisor));
        apply(q.splice(0, n));
      }, ui.logPacing.tickMs);
    },
    [apply],
  );

  const clearJob = useCallback(() => {
    if (jobId.current) deleteJob(jobId.current);
    jobId.current = null;
  }, []);

  const reset = useCallback(() => {
    abort.current?.abort();
    clearJob();
    stopPacer();
    setState(EMPTY);
  }, [clearJob]);

  const start = useCallback(
    async (args: { engine: EngineInfo; files: File[]; options: Options; headers: string[]; datasets: SourceDataset[] }) => {
      abort.current?.abort();
      clearJob();
      stopPacer();
      const ctl = new AbortController();
      abort.current = ctl;
      counter.current = 0;
      const mode = args.engine.kind;
      setState({
        ...EMPTY,
        status: 'running',
        mode,
        startedAt: Date.now(),
        snapshot: {
          options: args.options,
          headers: args.headers,
          command: args.files.length > 1 ? 'run2' : 'run',
          datasets: args.datasets,
          fileName: args.files.length > 1 ? `${args.files.length}-datasets` : args.files[0].name,
        },
      });
      if (mode === 'real') {
        await runOnServer(args.files, args.options, onEvent, (id) => (jobId.current = id), ctl.signal);
      } else if (args.files.length > 1) {
        const files = await Promise.all(args.files.map(async (f) => ({ name: f.name, text: await f.text() })));
        await simulateRun2({ files, options: args.options }, onEvent, { signal: ctl.signal, speed: simulation.speed });
      } else {
        const text = await args.files[0].text();
        await simulate({ fileName: args.files[0].name, text, options: args.options }, onEvent, { signal: ctl.signal, speed: simulation.speed });
      }
    },
    [clearJob, onEvent],
  );

  const cancel = useCallback(() => {
    abort.current?.abort();
    clearJob();
    stopPacer();
    setState((s) => (s.status === 'running' ? { ...s, status: 'failed', error: 'Cancelled.', finishedAt: Date.now() } : s));
  }, [clearJob]);

  useEffect(
    () => () => {
      abort.current?.abort();
      clearInterval(frame.current);
      if (jobId.current) deleteJob(jobId.current);
    },
    [],
  );

  return { state, start, cancel, reset };
}
