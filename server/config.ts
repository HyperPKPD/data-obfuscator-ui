import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Read .env from the app folder (values already set in the environment win).
try {
  process.loadEnvFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  /* no .env file: use defaults and the real environment */
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = path.resolve(here, '..');

import { server as defaultsFromFile } from '../app.config';

const d = defaultsFromFile;

const int = (name: string, def: number, min = 1): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= min ? Math.floor(v) : def;
};

/** Settings in app.config.ts, overridden by environment variables (or .env) when those are set. */
export const config = {
  port: int('PORT', d.port, 1),
  host: process.env.HOST || d.host,
  jobsDir: path.resolve(APP_ROOT, process.env.JOBS_DIR || d.jobsDir),
  maxUploadMb: int('MAX_UPLOAD_MB', d.maxUploadMb),
  maxFiles: int('MAX_FILES', d.maxFiles),
  maxConcurrent: int('MAX_CONCURRENT_JOBS', d.maxConcurrentJobs),
  timeoutSeconds: int('JOB_TIMEOUT_SECONDS', d.jobTimeoutSeconds),
  ttlMinutes: int('JOB_TTL_MINUTES', d.jobTtlMinutes),
  ratePerHour: int('RATE_LIMIT_PER_HOUR', d.ratePerHour),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? d.allowedOrigin,
  trustProxy: process.env.TRUST_PROXY ? process.env.TRUST_PROXY === '1' : d.trustProxy,
  keepAliveSeconds: d.keepAliveSeconds,
  cleanupEveryMinutes: d.cleanupEveryMinutes,
  maxOptionsKb: d.maxOptionsKb,
  headReadKb: d.headReadKb,
  contentSecurityPolicy: d.contentSecurityPolicy,
  production: process.env.NODE_ENV === 'production',
  distDir: path.join(APP_ROOT, 'dist'),
};

const exe = process.platform === 'win32' ? 'data-obfuscator.exe' : 'data-obfuscator';

function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Where to find the real program. First hit wins. */
export function candidateBinaries(): string[] {
  const list: string[] = [];
  if (process.env.DATA_OBFUSCATOR_BIN) list.push(path.resolve(APP_ROOT, process.env.DATA_OBFUSCATOR_BIN));
  for (const dir of d.binarySearch) list.push(path.resolve(APP_ROOT, dir, exe));
  return list;
}

export interface BinaryInfo {
  path: string | null;
  version: string;
  tried: string[];
  problem?: string;
}

export function findBinary(): BinaryInfo {
  const tried = candidateBinaries();
  for (const p of tried) {
    if (!isFile(p)) continue;
    try {
      const out = execFileSync(p, ['--version', '--no-color'], { timeout: 5000, encoding: 'utf8', env: { NO_COLOR: '1', PATH: process.env.PATH ?? '' } });
      const m = out.match(/\d+\.\d+\.\d+(?:\.\d+)?/);
      return { path: p, version: m ? m[0] : 'unknown', tried };
    } catch (e) {
      return { path: null, version: '', tried, problem: `Found ${p} but it did not run: ${(e as Error).message.split('\n')[0]}` };
    }
  }
  return { path: null, version: '', tried, problem: 'The data-obfuscator program was not found.' };
}

export const hasDist = () => existsSync(path.join(config.distDir, 'index.html'));
