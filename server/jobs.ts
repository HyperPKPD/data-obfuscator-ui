import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { buildArgs } from '../src/shared/options.ts';
import { detectLevel, detectStep } from '../src/shared/steps.ts';
import type { Options, ResultFile, RunEvent } from '../src/shared/types.ts';
import { config } from './config.ts';

export const JOB_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const FILE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export interface Job {
  id: string;
  dir: string;
  inDir: string;
  outDir: string;
  created: number;
  status: 'running' | 'done' | 'failed';
  events: RunEvent[];
  listeners: Set<(e: RunEvent, index: number) => void>;
  child?: ChildProcess;
  timer?: NodeJS.Timeout;
}

const jobs = new Map<string, Job>();

export const getJob = (id: string) => jobs.get(id);
export const runningCount = () => [...jobs.values()].filter((j) => j.status === 'running').length;

export function createJob(): Job {
  const id = randomUUID();
  const dir = path.join(config.jobsDir, id);
  const job: Job = {
    id,
    dir,
    inDir: path.join(dir, 'in'),
    outDir: path.join(dir, 'out'),
    created: Date.now(),
    status: 'running',
    events: [],
    listeners: new Set(),
  };
  mkdirSync(job.inDir, { recursive: true });
  jobs.set(id, job);
  return job;
}

function push(job: Job, e: RunEvent) {
  job.events.push(e);
  const i = job.events.length - 1;
  for (const l of job.listeners) l(e, i);
}

export function listOutputs(job: Job): ResultFile[] {
  try {
    return readdirSync(job.outDir)
      .filter((n) => FILE_NAME_RE.test(n))
      .map((name) => ({ name, size: statSync(path.join(job.outDir, name)).size }))
      .filter((f) => f.size >= 0);
  } catch {
    return [];
  }
}

const BOX = /[─-╿]/;

/** Start the real program for a prepared job. Events are recorded for replay and pushed to listeners. */
export function startJob(job: Job, bin: string, options: Options, headers: string[], inputPaths: string[]) {
  const args = buildArgs(options, headers, inputPaths, job.outDir);
  const scrub = (t: string) => t.replaceAll(job.dir, '.').replaceAll(bin, 'data-obfuscator');
  push(job, { type: 'log', level: 'plain', text: `$ data-obfuscator ${args.map((a) => scrub(a)).join(' ')}` });

  let child: ChildProcess;
  try {
    child = spawn(bin, args, {
      cwd: job.dir,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH ?? '', NO_COLOR: '1', LANG: 'C.UTF-8' },
      windowsHide: true,
    });
  } catch (e) {
    job.status = 'failed';
    push(job, { type: 'fail', message: `Could not start the program: ${(e as Error).message}` });
    return;
  }
  job.child = child;

  let lastError = '';
  let warnings = 0;
  let timedOut = false;
  const feed = (chunk: Buffer, carry: { s: string }) => {
    carry.s += chunk.toString('utf8');
    const parts = carry.s.split(/\r?\n/);
    carry.s = parts.pop() ?? '';
    for (const line of parts) handle(line);
  };
  const handle = (raw: string) => {
    const line = scrub(raw.replace(/\u001b\[[0-9;]*m/g, '')).trimEnd();
    if (!line.trim() || BOX.test(line)) return;
    const level = detectLevel(line);
    if (level === 'warn') warnings++;
    if (level === 'error') lastError = line.replace(/^.*\[(ERROR|FATAL)\]\s*/, '');
    push(job, { type: 'log', level, text: line });
    const step = detectStep(line);
    if (step && step !== 'done') push(job, { type: 'step', step });
  };
  const outCarry = { s: '' };
  const errCarry = { s: '' };
  child.stdout?.on('data', (c: Buffer) => feed(c, outCarry));
  child.stderr?.on('data', (c: Buffer) => feed(c, errCarry));

  job.timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, config.timeoutSeconds * 1000);

  child.on('error', (e) => {
    clearTimeout(job.timer);
    job.status = 'failed';
    push(job, { type: 'fail', message: `Could not run the program: ${e.message}` });
  });
  child.on('close', (code) => {
    clearTimeout(job.timer);
    if (outCarry.s) handle(outCarry.s);
    if (errCarry.s) handle(errCarry.s);
    if (job.status !== 'running') return;
    if (code === 0) {
      job.status = 'done';
      push(job, { type: 'step', step: 'done' });
      push(job, { type: 'done', files: listOutputs(job), warnings });
    } else {
      job.status = 'failed';
      const why = timedOut ? `The run took longer than ${config.timeoutSeconds} seconds and was stopped.` : lastError || `The program stopped with exit code ${code}.`;
      push(job, { type: 'fail', message: why });
    }
  });
}

export function removeJob(id: string) {
  const job = jobs.get(id);
  if (!job) return;
  clearTimeout(job.timer);
  if (job.child && job.status === 'running') job.child.kill('SIGKILL');
  job.listeners.clear();
  jobs.delete(id);
  rmSync(job.dir, { recursive: true, force: true });
}

/** Delete jobs older than the TTL, and leftovers of an earlier server run. */
export function sweep() {
  const limit = Date.now() - config.ttlMinutes * 60_000;
  for (const j of [...jobs.values()]) if (j.created < limit) removeJob(j.id);
  try {
    for (const name of readdirSync(config.jobsDir)) {
      if (!JOB_ID_RE.test(name) || jobs.has(name)) continue;
      const p = path.join(config.jobsDir, name);
      if (statSync(p).mtimeMs < limit) rmSync(p, { recursive: true, force: true });
    }
  } catch {
    /* folder not created yet */
  }
}
