import { DEFAULT_PROTECT, detectRole } from './detect';
import { effectiveProtect, sameNames } from './plan';
import type { ColumnSetting, Options, RoleChoice } from './types';

import { defaults } from '../../app.config';

/**
 * The data-obfuscator program's OWN defaults. A flag is only sent when a value differs from these,
 * so they must match the program, not the starting values in app.config.ts.
 */
export const DEFAULTS = {
  level: 2,
  scaleMin: 1,
  scaleMax: 20,
  dateShiftMin: 1,
  dateShiftMax: 100,
  renamePrefix: 'COL',
  commentChars: '#;$',
} as const;

export function defaultColumn(): ColumnSetting {
  return { role: 'auto', keep: true, renameFlag: false, newName: '' };
}

export function defaultOptions(headers: string[] = []): Options {
  const columns: Record<string, ColumnSetting> = {};
  for (const h of headers) columns[h] = defaultColumn();
  return {
    level: defaults.level,
    seed: defaults.seed,
    idStyle: defaults.idStyle,
    columns,
    scaleMin: defaults.scale.min,
    scaleMax: defaults.scale.max,
    dateShiftMode: 'random',
    dateShiftMin: defaults.dateShift.min,
    dateShiftMax: defaults.dateShift.max,
    dateShiftFixed: defaults.dateShift.fixed,
    renameMode: 'off',
    renamePrefix: defaults.renamePrefix,
    writeKeymap: defaults.writeKeymap,
    dropFreetext: false,
    protect: [...DEFAULT_PROTECT],
    adamHints: true,
    delimiter: 'auto',
    noHeader: false,
    commentChars: defaults.commentChars,
    verbose: false,
    outputName: '',
  };
}

const ROLE_FLAG: Record<Exclude<RoleChoice, 'auto' | 'protect'>, string> = {
  id: '--id-column',
  subject: '--subject-column',
  study: '--study-column',
  site: '--site-column',
  user: '--user-column',
  treatment: '--treatment-column',
  date: '--date-columns',
  freetext: '--freetext-columns',
  covariate: '--scale-columns',
  sensitive: '--sensitive',
};

/** Words the user sees for each choice (also used in the config text comments). */
export const PROTECT_NAME_RE = /^[^\s,;|"'=\u0000-\u001f]{1,64}$/;
export const NEW_NAME_RE = /^[^\s,;|"'=\u0000-\u001f]{1,64}$/;

export function validateOptions(o: Options, headers: string[], multi = false): string[] {
  const problems: string[] = [];
  if (multi && o.level >= 4) problems.push('Several datasets can be masked together at levels 1 to 3. Level 4 re-sorts the rows, which cannot be traced through a combined dataset.');
  if (o.protect.some((n) => !PROTECT_NAME_RE.test(n))) problems.push('A protected column name may not contain spaces, commas, semicolons, quotes or "=".');
  if (!Number.isFinite(o.seed) || o.seed < 0 || !Number.isInteger(o.seed)) problems.push('The seed must be a whole number, 0 or higher.');
  if (!(o.scaleMin > 0) || !(o.scaleMax >= o.scaleMin)) problems.push('The scaling range needs 0 < minimum <= maximum.');
  if (o.dateShiftMode === 'random' && !(Number.isFinite(o.dateShiftMin) && Number.isFinite(o.dateShiftMax))) {
    problems.push('The date shift window needs two numbers.');
  }
  if (o.dateShiftMode === 'fixed' && !Number.isFinite(o.dateShiftFixed)) problems.push('The fixed date shift must be a number.');
  if (!headers.some((h) => o.columns[h]?.keep !== false)) problems.push('Keep at least one column.');
  if (o.renameMode !== 'off' && !multi) {
    if (!NEW_NAME_RE.test(o.renamePrefix)) problems.push('The rename prefix may not contain spaces, commas, semicolons, quotes or "=".');
    const flagged = headers.filter((h) => o.columns[h]?.keep !== false && o.columns[h]?.renameFlag);
    if (o.renameMode === 'except' && flagged.length === 0) problems.push('Tick at least one column to keep its name, or switch renaming off.');
    if (o.renameMode === 'selected' && flagged.length === 0) problems.push('Tick the columns to rename, or switch renaming off.');
    const used = new Set<string>();
    for (const h of headers) {
      const c = o.columns[h];
      if (!c || c.keep === false) continue;
      if (o.renameMode === 'selected' && c.renameFlag && c.newName) {
        if (!NEW_NAME_RE.test(c.newName)) problems.push(`The new name "${c.newName}" may not contain spaces, commas, semicolons, quotes or "=".`);
        const k = c.newName.toLowerCase();
        if (used.has(k)) problems.push(`The new name "${c.newName}" is used twice.`);
        used.add(k);
      }
    }
    for (const h of headers) {
      const c = o.columns[h];
      if (!c || c.keep === false) continue;
      const renamedAway = o.renameMode === 'selected' ? c.renameFlag : !c.renameFlag;
      if (!renamedAway && used.has(h.toLowerCase())) problems.push(`The new name "${h}" clashes with a column that keeps its name.`);
    }
  }
  return problems;
}

type Pair = [flag: string, value?: string];

/** All flags for a run, as [flag, value] pairs. Only settings that differ from the program's defaults are listed. */
export function optionPairs(o: Options, headers: string[], multi = false): Pair[] {
  const pairs: Pair[] = [];
  const kept = headers.filter((h) => o.columns[h]?.keep !== false);
  const dropped = headers.filter((h) => o.columns[h]?.keep === false);

  pairs.push(['--level', String(o.level)]);
  pairs.push(['--seed', String(o.seed)]);
  if (o.idStyle !== 'sequential') pairs.push(['--id-style', o.idStyle]);
  if (dropped.length) pairs.push(['--drop', dropped.join(',')]);

  // column roles
  const byFlag = new Map<string, string[]>();
  for (const h of kept) {
    const r = o.columns[h]?.role ?? 'auto';
    if (r === 'auto' || r === 'protect') continue;
    const flag = ROLE_FLAG[r];
    byFlag.set(flag, [...(byFlag.get(flag) ?? []), h]);
  }
  for (const flag of Object.values(ROLE_FLAG)) {
    const list = byFlag.get(flag);
    if (list?.length) pairs.push([flag, list.join(',')]);
  }
  // The program's own list is only sent when the real list differs from it.
  const protect = effectiveProtect(o, headers);
  if (!sameNames(protect, DEFAULT_PROTECT)) pairs.push(['--protect', protect.join(',')]);
  if (multi && !o.adamHints) pairs.push(['--adam-hints', 'false']);

  if (o.level < 4 && o.dropFreetext) pairs.push(['--drop-freetext']);

  // numbers and dates
  if (o.level >= 3 && (o.scaleMin !== DEFAULTS.scaleMin || o.scaleMax !== DEFAULTS.scaleMax)) {
    pairs.push(['--scale-range', `${o.scaleMin}-${o.scaleMax}`]);
  }
  if (o.level >= 2) {
    if (o.dateShiftMode === 'fixed') pairs.push(['--date-shift-days', String(o.dateShiftFixed)]);
    else if (o.dateShiftMin !== DEFAULTS.dateShiftMin || o.dateShiftMax !== DEFAULTS.dateShiftMax) {
      pairs.push(['--date-shift-days', `${o.dateShiftMin}-${o.dateShiftMax}`]);
    }
  }

  // renaming (not available when several datasets are masked together)
  if (multi) {
    /* run2 keeps the column names */
  } else if (o.renameMode === 'selected') {
    const items = kept
      .filter((h) => o.columns[h].renameFlag)
      .map((h) => (o.columns[h].newName ? `${h}=${o.columns[h].newName}` : h));
    if (items.length) pairs.push(['--rename-columns', items.join(',')]);
  } else if (o.renameMode === 'except') {
    const keepNames = kept.filter((h) => o.columns[h].renameFlag);
    if (keepNames.length) pairs.push(['--rename-except', keepNames.join(',')]);
  }
  if (!multi && o.renameMode !== 'off' && o.renamePrefix !== DEFAULTS.renamePrefix) pairs.push(['--rename-prefix', o.renamePrefix]);

  // reading and output
  if (o.delimiter !== 'auto') pairs.push(['--delimiter', o.delimiter]);
  if (o.noHeader && !multi) {
    pairs.push(['--no-header']);
    pairs.push(['--columns', headers.join(',')]);
  }
  if (o.commentChars !== DEFAULTS.commentChars) pairs.push(['--comment-chars', o.commentChars]);
  if (!o.writeKeymap) pairs.push(['--write-keymap', 'false']);
  if (!multi && o.outputName.trim()) pairs.push(['--output-name', o.outputName.trim()]);
  if (o.verbose) pairs.push(['--verbose']);
  return pairs;
}

/** Argument vector for spawning the program (no shell involved; `--flag=value` keeps odd values safe). One input = `run`, several = `run2`. */
export function buildArgs(o: Options, headers: string[], inputPaths: string[], outputDir: string): string[] {
  const multi = inputPaths.length > 1;
  const args = ['--no-color', multi ? 'run2' : 'run'];
  for (const p of inputPaths) args.push(`--input=${p}`);
  args.push(`--output=${outputDir}`);
  for (const [f, v] of optionPairs(o, headers, multi)) args.push(v === undefined ? f : `${f}=${v}`);
  return args;
}

function shellQuote(s: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `"${s.replace(/(["\\$`])/g, '\\$1')}"`;
}

/** The same run as a command the user can paste into a terminal. */
export function commandLine(o: Options, headers: string[], inputNames: string[]): string {
  const multi = inputNames.length > 1;
  const parts = [multi ? 'data-obfuscator run2' : 'data-obfuscator run', ...inputNames.map((n) => `--input ${shellQuote(n)}`), `--output ./masked${multi ? '2' : ''}`];
  for (const [f, v] of optionPairs(o, headers, multi)) parts.push(v === undefined ? f : `${f} ${shellQuote(v)}`);
  return parts.join(' \\\n  ');
}

/** The same run as an options file. */
export function configText(o: Options, headers: string[], inputNames: string[]): string {
  const multi = inputNames.length > 1;
  const lines = [...inputNames.map((n) => `input  = ${n}`), `output = ./masked${multi ? '2' : ''}`];
  for (const [f, v] of optionPairs(o, headers, multi)) {
    const key = f === '-v' ? 'verbose' : f.replace(/^--/, '').replace(/-/g, '_');
    const value = v === undefined ? 'true' : /[#]/.test(v) ? `"${v}"` : v;
    lines.push(`${key} = ${value}`);
  }
  return lines.join('\n') + '\n';
}

export function autoRoleFor(name: string) {
  return detectRole(name);
}

/** Server-side: turn untrusted JSON into a well-formed Options object or throw. */
export function normalizeOptions(raw: unknown, headers: string[], multi = false): Options {
  if (typeof raw !== 'object' || raw === null) throw new Error('Options are missing.');
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, name: string): number => {
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) throw new Error(`${name} must be a number.`);
    return n;
  };
  const pick = <T extends string>(v: unknown, allowed: readonly T[], name: string): T => {
    if (typeof v === 'string' && (allowed as readonly string[]).includes(v)) return v as T;
    throw new Error(`${name} is not valid.`);
  };
  const level = num(r.level, 'level');
  if (![1, 2, 3, 4].includes(level)) throw new Error('level must be 1, 2, 3 or 4.');
  const cols: Record<string, ColumnSetting> = {};
  const rc = (r.columns ?? {}) as Record<string, Partial<ColumnSetting>>;
  const roles: RoleChoice[] = ['auto', 'id', 'subject', 'study', 'site', 'user', 'treatment', 'date', 'freetext', 'covariate', 'sensitive', 'protect'];
  for (const h of headers) {
    const c = rc[h] ?? {};
    cols[h] = {
      role: roles.includes(c.role as RoleChoice) ? (c.role as RoleChoice) : 'auto',
      keep: c.keep !== false,
      renameFlag: c.renameFlag === true,
      newName: typeof c.newName === 'string' ? c.newName.trim().slice(0, 64) : '',
    };
  }
  const str = (v: unknown, def: string, max = 64) => (typeof v === 'string' ? v.slice(0, max) : def);
  const out: Options = {
    level: level as Options['level'],
    seed: Math.trunc(num(r.seed, 'seed')),
    idStyle: pick(r.idStyle, ['sequential', 'padded', 'hashed'] as const, 'idStyle'),
    columns: cols,
    scaleMin: num(r.scaleMin, 'scaleMin'),
    scaleMax: num(r.scaleMax, 'scaleMax'),
    dateShiftMode: pick(r.dateShiftMode, ['random', 'fixed'] as const, 'dateShiftMode'),
    dateShiftMin: num(r.dateShiftMin, 'dateShiftMin'),
    dateShiftMax: num(r.dateShiftMax, 'dateShiftMax'),
    dateShiftFixed: num(r.dateShiftFixed, 'dateShiftFixed'),
    renameMode: pick(r.renameMode, ['off', 'selected', 'except'] as const, 'renameMode'),
    renamePrefix: str(r.renamePrefix, 'COL', 32),
    writeKeymap: r.writeKeymap !== false,
    dropFreetext: r.dropFreetext === true,
    protect: Array.isArray(r.protect) ? [...new Set((r.protect as unknown[]).filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean))].slice(0, 300) : [...DEFAULT_PROTECT],
    adamHints: r.adamHints !== false,
    delimiter: pick(r.delimiter, ['auto', 'comma', 'tab', 'semicolon', 'space'] as const, 'delimiter'),
    noHeader: r.noHeader === true,
    commentChars: str(r.commentChars, '#;$', 8),
    verbose: r.verbose === true,
    outputName: str(r.outputName, '', 80).replace(/[^A-Za-z0-9._-]/g, '_'),
  };
  const problems = validateOptions(out, headers, multi);
  if (problems.length) throw new Error(problems[0]);
  return out;
}
