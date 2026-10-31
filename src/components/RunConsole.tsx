import { useEffect, useRef, useState } from 'react';
import { ui } from '../../app.config';
import type { RunState } from '../lib/useRun';
import { STEP_LABEL, STEP_LABEL_RUN2, stepsFor } from '../shared/steps';
import type { RunStep } from '../shared/types';
import { Badge, Button, Icon } from './ui';

const LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}\.\d{3}) UTC \[(\w+)\] (.*)$/;

const LEVEL_COLOR: Record<string, string> = {
  info: 'text-[#8fb4ff]',
  ok: 'text-[#5fe0b3]',
  warn: 'text-[#ffc861]',
  error: 'text-[#ff8a80]',
  debug: 'text-[#8a95a5]',
};

function LogLine({ level, text }: { level: string; text: string }) {
  const m = text.match(LINE);
  if (!m) return <div className={`log-line ${level === 'plain' ? 'text-[#8a95a5]' : (LEVEL_COLOR[level] ?? '')}`}>{text}</div>;
  return (
    <div className="log-line">
      <span className="text-[#6c7a91]">{m[2]}</span> <span className={`${LEVEL_COLOR[level] ?? ''} font-semibold`}>{m[3].padEnd(5, ' ')}</span> <span>{m[4]}</span>
    </div>
  );
}

export function RunConsole({ run, onCancel }: { run: RunState; onCancel: () => void }) {
  const command = run.snapshot?.command ?? 'run';
  const SHOWN: RunStep[] = stepsFor(command);
  const label = (s: RunStep) => (command === 'run2' ? STEP_LABEL_RUN2[s] ?? STEP_LABEL[s] : STEP_LABEL[s]);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (run.status !== 'running') return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [run.status]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [run.logs.length]);

  const elapsed = ((run.status === 'running' ? now : run.finishedAt) - run.startedAt) / 1000;
  const active = run.status === 'running' ? SHOWN.find((s) => !run.steps.includes(s)) : undefined;
  const doneCount = SHOWN.filter((s) => run.steps.includes(s)).length;

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-[15px] font-bold tracking-tight">{run.status === 'running' ? 'Running…' : run.status === 'done' ? 'Finished' : run.status === 'failed' ? 'Stopped' : 'Run'}</h2>
          {run.mode && <Badge tone={run.mode === 'real' ? 'safe' : 'warn'}>{run.mode === 'real' ? (command === 'run2' ? 'Real program, run2' : 'Real program') : 'Simulation'}</Badge>}
          <span className="font-mono text-[13px] tabular-nums text-muted">{elapsed.toFixed(1)} s</span>
        </div>
        {run.status === 'running' && (
          <Button size="sm" variant="secondary" icon="stop" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      <ol className={`grid grid-cols-2 gap-px bg-line sm:grid-cols-3 ${SHOWN.length === 7 ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`} aria-label="Progress">
        {SHOWN.map((s) => {
          const done = run.steps.includes(s);
          const on = s === active;
          return (
            <li key={s} aria-current={on ? 'step' : undefined} className={`flex items-center gap-2 px-3 py-2.5 text-[13px] ${done ? 'bg-surface text-ink' : on ? 'bg-mask-soft text-mask-ink' : 'bg-sunken text-faint'}`}>
              <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${done ? 'bg-safe text-surface' : on ? 'bg-mask text-surface' : 'border border-line-strong'}`}>{done ? <Icon name="check" size={11} /> : on ? <span className="h-1.5 w-1.5 rounded-full bg-surface" /> : null}</span>
              <span className="font-medium leading-tight">{label(s)}</span>
            </li>
          );
        })}
      </ol>
      <div className="h-1 bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={SHOWN.length} aria-valuenow={doneCount} aria-label="Run progress">
        <div className={`h-full transition-all duration-300 ${run.status === 'failed' ? 'bg-bad' : 'bg-mask'}`} style={{ width: `${(doneCount / SHOWN.length) * 100}%` }} />
      </div>

      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        style={{ height: ui.consoleHeight }}
        className="scroll-thin overflow-auto bg-console px-4 py-3 font-mono text-[12.5px] leading-[1.65] text-console-ink"
        role="log"
        aria-live="off"
        aria-label="Run log"
        tabIndex={0}
      >
        {run.logs.length === 0 && <div className="text-[#6c7a91]">Starting…</div>}
        {run.logs.map((l) => (
          <LogLine key={l.id} level={l.level} text={l.text} />
        ))}
      </div>

      {run.status === 'failed' && (
        <div role="alert" className="flex items-start gap-3 border-t border-bad/30 bg-bad-soft px-5 py-3 text-sm text-bad">
          <Icon name="warn" className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">The run did not finish</p>
            <p className="mt-0.5">{run.error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
