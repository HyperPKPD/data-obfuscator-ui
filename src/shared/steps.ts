import type { LogLevel, RunCommand, RunStep } from './types';

export const STEP_ORDER: RunStep[] = ['read', 'plan', 'mask', 'write', 'reports', 'prompts', 'tokens', 'done'];

/** The steps shown for a run. `run2` writes no token estimate. */
export const stepsFor = (command: RunCommand): RunStep[] => STEP_ORDER.filter((s) => s !== 'done' && (command === 'run' || s !== 'tokens'));

/** Step names when several datasets are masked together. */
export const STEP_LABEL_RUN2: Partial<Record<RunStep, string>> = {
  read: 'Reading the files',
  plan: 'Matching columns and dates',
  mask: 'Masking with shared codes',
  write: 'Writing the masked files',
  reports: 'Key and summary',
  prompts: 'Building the prompts',
};

export const STEP_LABEL: Record<RunStep, string> = {
  read: 'Reading the file',
  plan: 'Detecting column roles',
  mask: 'Masking values',
  write: 'Writing the masked dataset',
  reports: 'Key, report and summary',
  prompts: 'Building the prompt pack',
  tokens: 'Estimating tokens',
  done: 'Finished',
};

/** Which step a log line of the real program belongs to (the simulation prints the same lines). */
export function detectStep(line: string): RunStep | null {
  if (/\bread \d+ rows|\bread \S+ \(\d+ rows/.test(line)) return 'read';
  if (/planning columns|date shift \((dataset-wide|one value for all)|recognised as .* \(ADaM naming\)/.test(line)) return 'plan';
  if (/scaling column|recoded \d+ unique|projecting \d+ of|renamed \d+ column|domain \w+: \d+ unique/.test(line)) return 'mask';
  if (/wrote dataset|dataset SHA-256|wrote \S+_masked\S* \(/.test(line)) return 'write';
  if (/wrote .*(config\.used|column_report|key map|keymap|summary)/.test(line)) return 'reports';
  if (/wrote .*llm2?\.txt/.test(line)) return 'prompts';
  if (/wrote .*tokens\.txt/.test(line)) return 'tokens';
  if (/run2? complete/.test(line)) return 'done';
  return null;
}

/** Level of a line printed by the program: `2026-10-08 06:42:07.398 UTC [OK] ...`. */
export function detectLevel(line: string): LogLevel {
  const m = line.match(/\[(INFO|OK|WARN|ERROR|FATAL|DEBUG)\]/);
  if (!m) {
    if (/^\s*\[(OK)\]/.test(line)) return 'ok';
    if (/^\s*\[(X)\]|FAILED/.test(line)) return 'error';
    if (/^\s*\[!\]|warning/i.test(line)) return 'warn';
    return 'plain';
  }
  switch (m[1]) {
    case 'OK':
      return 'ok';
    case 'WARN':
      return 'warn';
    case 'ERROR':
    case 'FATAL':
      return 'error';
    case 'DEBUG':
      return 'debug';
    default:
      return 'info';
  }
}
