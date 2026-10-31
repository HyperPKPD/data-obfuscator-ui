// In-browser SIMULATION of data-obfuscator.
//
// It follows the same rules as the Rust program closely enough to show how the masked data, the
// reports and the log will look, and it prints the same log lines, so the same progress tracker
// works for both engines. It is a demo: it does NOT produce byte-identical output to the real
// program, and a browser-side run is not a substitute for running the real program on your data.

import { DEFAULT_PROTECT, looksLikeNumber, normName, type Role } from './detect';
import { planColumns, type ColumnPlan } from './plan';
import { DELIM_CHAR, parseDelimited, quoteField } from './csv';
import { optionPairs } from './options';
import type { Options, ResultFile, RunEvent } from './types';

export const SIM_VERSION = 'simulation';

// ---------------------------------------------------------------- helpers

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pad = (n: number, w: number) => String(Math.trunc(n)).padStart(w, '0');
export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

export function stamp(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)} ${pad(d.getUTCHours(), 2)}:${pad(d.getUTCMinutes(), 2)}:${pad(d.getUTCSeconds(), 2)}.${pad(d.getUTCMilliseconds(), 3)} UTC`;
}
export const stampShort = (d: Date) => stamp(d).slice(0, 19) + ' UTC';

export const bytes = (s: string) => new TextEncoder().encode(s).length;

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DAY_MS = 86_400_000;

/** Shift a date written in one of the common forms. Returns null if the cell is not a date. */
export function shiftDate(v: string, days: number): string | null {
  const t = v.trim();
  if (!t || t === '.') return null;
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})(?:([T ])(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (m) {
    const [, y, mo, d, sep, hh, mm, ss] = m;
    const base = Date.UTC(+y, +mo - 1, +d, hh ? +hh : 0, mm ? +mm : 0, ss ? +ss : 0);
    if (!sep) {
      const out = new Date(base + Math.trunc(days) * DAY_MS);
      return `${pad(out.getUTCFullYear(), 4)}-${pad(out.getUTCMonth() + 1, 2)}-${pad(out.getUTCDate(), 2)}`;
    }
    const out = new Date(base + Math.round(days * DAY_MS));
    const date = `${pad(out.getUTCFullYear(), 4)}-${pad(out.getUTCMonth() + 1, 2)}-${pad(out.getUTCDate(), 2)}`;
    const time = `${pad(out.getUTCHours(), 2)}:${pad(out.getUTCMinutes(), 2)}` + (ss !== undefined ? `:${pad(out.getUTCSeconds(), 2)}` : '');
    return `${date}${sep}${time}`;
  }
  m = t.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) {
    const out = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) + Math.trunc(days) * DAY_MS);
    return `${pad(out.getUTCFullYear(), 4)}${pad(out.getUTCMonth() + 1, 2)}${pad(out.getUTCDate(), 2)}`;
  }
  m = t.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{4})$/);
  if (m && MONTHS.includes(m[2].toUpperCase())) {
    const out = new Date(Date.UTC(+m[3], MONTHS.indexOf(m[2].toUpperCase()), +m[1]) + Math.trunc(days) * DAY_MS);
    const mon = MONTHS[out.getUTCMonth()];
    const shown = m[2] === m[2].toUpperCase() ? mon : mon[0] + mon.slice(1).toLowerCase();
    return `${pad(out.getUTCDate(), 2)}-${shown}-${out.getUTCFullYear()}`;
  }
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const out = new Date(Date.UTC(+m[3], +m[1] - 1, +m[2]) + Math.trunc(days) * DAY_MS);
    return `${pad(out.getUTCMonth() + 1, 2)}/${pad(out.getUTCDate(), 2)}/${out.getUTCFullYear()}`;
  }
  return null;
}

export function numberText(x: number): string {
  return String(Number(x.toPrecision(8)));
}

// ---------------------------------------------------------------- token estimate

function estimateTokens(text: string): number {
  let n = 0;
  const re = /[A-Za-z]+|\d{1,3}|[^\sA-Za-z\d]|\n/g;
  for (const m of text.matchAll(re)) {
    const w = m[0];
    n += /^[A-Za-z]+$/.test(w) ? Math.max(1, Math.ceil(w.length / 5)) : 1;
  }
  return n;
}

const MODEL_FACTORS: [string, number][] = [
  ['GPT-4 / GPT-3.5 (cl100k_base)', 1],
  ['GPT-4o / GPT-4.1 / o-series / GPT-5 (o200k_base)', 1],
  ['Claude 3 and later (Anthropic)', 1.01],
  ['Gemini (Google)', 1.19],
  ['Llama 3 / 3.1 / 3.3 (Meta)', 1],
  ['Qwen 2 / 2.5 / 3 (Alibaba)', 1.32],
  ['Mistral 7B / Mixtral / Llama 2 (32k vocab)', 1.58],
];

// ---------------------------------------------------------------- the run

export interface SimInput {
  fileName: string;
  text: string;
  options: Options;
}

export interface SimResult {
  files: ResultFile[];
  warnings: number;
}

const LEVEL_NAME: Record<number, string> = { 1: 'light', 2: 'clinical', 3: 'covariate masking', 4: 'maximum' };

/**
 * Runs the simulation. Events are delivered through `emit`. `speed` scales the artificial pauses
 * (0 = no pauses, used by tests). Resolves with the files, or null after emitting `fail`.
 */
export async function simulate(
  input: SimInput,
  emit: (e: RunEvent) => void,
  opts: { signal?: AbortSignal; speed?: number } = {},
): Promise<SimResult | null> {
  const { signal } = opts;
  const speed = opts.speed ?? 1;
  const wait = (ms: number) => sleep(ms * speed, signal);
  const o = input.options;
  let warnings = 0;
  const log = (level: 'INFO' | 'OK' | 'WARN' | 'ERROR' | 'DEBUG', text: string) => {
    if (level === 'WARN') warnings++;
    const line = `${stamp(new Date())} [${level}] ${text}`;
    logLines.push(line);
    emit({ type: 'log', level: level.toLowerCase() as 'info', text: line });
  };
  const logLines: string[] = [];
  const fail = (message: string): null => {
    log('ERROR', message);
    emit({ type: 'fail', message });
    return null;
  };

  try {
    const started = new Date();
    log('INFO', `log opened path=./masked/obfuscator.log pid=0 version=${SIM_VERSION} (browser SIMULATION, not the real program)`);
    log('INFO', `run start input=${input.fileName} output=./masked level=${o.level}`);
    await wait(250);

    // ---- read
    const table = parseDelimited(input.text, {
      delimiter: o.delimiter === 'auto' ? 'auto' : o.delimiter,
      noHeader: o.noHeader,
      commentChars: o.commentChars,
    });
    const { delimiter, rows } = table;
    const headers = table.headers;
    if (!rows.length) return fail('The file has no data rows.');
    if (headers.length < 2) return fail('The file has fewer than 2 columns. Check the delimiter setting.');
    const delimName = { comma: 'comma', tab: 'tab', semicolon: 'semicolon', space: 'space' }[delimiter];
    const fmt = delimiter === 'comma' ? 'CSV' : delimiter === 'tab' ? 'TSV' : delimiter === 'semicolon' ? 'semicolon-delimited' : 'whitespace-delimited';
    log('OK', `read ${rows.length} rows × ${headers.length} cols (${fmt} (${delimName})) from ${input.fileName}`);
    emit({ type: 'step', step: 'read' });
    await wait(350);

    // ---- plan
    log('INFO', `planning columns n=${headers.length} level=${o.level} seed=${o.seed}`);
    const rand = mulberry32(o.seed);

    type Plan = ColumnPlan;
    const plans: Plan[] = planColumns(headers, o);
    const kept = plans.filter((p) => p.keep);
    if (!kept.length) return fail('Every column was dropped.');

    // date shift: one value for the whole dataset
    const dateCols = kept.filter((p) => p.role === 'date');
    let shift = 0;
    if (o.level >= 2) {
      if (o.dateShiftMode === 'fixed') shift = o.dateShiftFixed;
      else {
        const lo = Math.min(o.dateShiftMin, o.dateShiftMax);
        const hi = Math.max(o.dateShiftMin, o.dateShiftMax);
        shift = Math.round((lo + rand() * (hi - lo)) * 10) / 10;
      }
      if (dateCols.length) {
        log('INFO', `date shift (dataset-wide, intervals preserved): ${shift} days`);
      }
    }
    await wait(300);

    // scaling factors
    interface Scale {
      op: 'multiply' | 'divide';
      factor: number;
      count: number;
    }
    const scales = new Map<string, Scale>();
    const scaleCols = kept.filter((p) => o.level >= 3 && p.role === 'covariate');
    for (const p of scaleCols) {
      const lo = Math.min(o.scaleMin, o.scaleMax);
      const hi = Math.max(o.scaleMin, o.scaleMax);
      const factor = Number((lo + rand() * (hi - lo)).toFixed(10));
      const op: 'multiply' | 'divide' = rand() < 0.5 ? 'multiply' : 'divide';
      scales.set(p.name, { op, factor, count: 0 });
      log('INFO', `scaling column ${p.name}: every valid number will be ${op === 'multiply' ? 'multiplied' : 'divided'} by ${factor}`);
    }
    emit({ type: 'step', step: 'plan' });
    await wait(300);

    // ---- mask (column by column)
    const dropFree = o.level >= 4 || o.dropFreetext;
    const recodeRoles: Role[] = ['id', 'subject', 'study', 'site', 'user'];
    const labelRoles: Role[] = ['treatment', 'sex', 'race', 'country'];
    const maps = new Map<string, Map<string, string>>();
    const outCols: Plan[] = [];
    for (const p of kept) {
      if (p.role === 'freetext' && dropFree) {
        log('INFO', `dropping free-text column ${p.name}`);
        continue;
      }
      outCols.push(p);
    }

    const labelFor = (p: Plan, ordinal: number): string => {
      switch (p.role) {
        case 'id':
          if (o.idStyle === 'padded') return pad(ordinal, 4);
          if (o.idStyle === 'hashed') return Math.floor(rand() * 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
          return String(ordinal);
        case 'subject':
          return `SUBJ${pad(ordinal, 3)}`;
        case 'study':
          return `STU${pad(ordinal, 3)}`;
        case 'site':
          return `SITE${pad(ordinal, 3)}`;
        case 'user':
          return `USER${pad(ordinal, 3)}`;
        case 'treatment':
          return `ARM_${String.fromCharCode(64 + ((ordinal - 1) % 26) + 1)}`;
        case 'sex':
          return String(ordinal - 1);
        case 'race':
          return `CAT${pad(ordinal, 3)}`;
        case 'country':
          return `C${pad(ordinal, 3)}`;
        default:
          return `${p.name.slice(0, 6).toUpperCase()}_${pad(ordinal, 3)}`;
      }
    };

    const recodeThisColumn = (p: Plan): boolean => {
      if (p.userRole === 'sensitive') return true;
      if (recodeRoles.includes(p.role)) return true;
      if (labelRoles.includes(p.role)) return o.level >= 2 || p.userRole !== 'auto';
      return false;
    };

    const colIdx = new Map(outCols.map((p) => [p.name, headers.indexOf(p.name)]));
    const out: string[][] = rows.map(() => new Array(outCols.length).fill(''));
    let nonNumeric = 0;
    for (let j = 0; j < outCols.length; j++) {
      const p = outCols[j];
      const src = colIdx.get(p.name)!;
      if (recodeThisColumn(p)) {
        const map = new Map<string, string>();
        for (let r = 0; r < rows.length; r++) {
          const v = (rows[r][src] ?? '').trim();
          if (v === '' || v === '.') {
            out[r][j] = rows[r][src] ?? '';
            continue;
          }
          let m = map.get(v);
          if (m === undefined) {
            m = labelFor(p, map.size + 1);
            map.set(v, m);
          }
          out[r][j] = m;
        }
        maps.set(p.name, map);
        log('OK', `recoded ${map.size} unique values in column ${p.name} (${p.userRole === 'sensitive' ? 'sensitive' : p.role})`);
      } else if (p.role === 'date' && o.level >= 2) {
        let changed = 0;
        for (let r = 0; r < rows.length; r++) {
          const v = rows[r][src] ?? '';
          let s = shiftDate(v, shift);
          if (s === null && looksLikeNumber(v)) s = numberText(Number(v) + shift);
          if (s === null) {
            out[r][j] = v;
          } else {
            out[r][j] = s;
            changed++;
          }
        }
        if (!changed && rows.length) {
          log('WARN', `date column ${p.name}: no value looked like a date, column left unchanged`);
        }
      } else if (p.role === 'freetext' && o.level >= 2) {
        for (let r = 0; r < rows.length; r++) {
          const v = (rows[r][src] ?? '').trim();
          out[r][j] = v === '' ? '' : '.';
        }
      } else if (scales.has(p.name)) {
        const s = scales.get(p.name)!;
        for (let r = 0; r < rows.length; r++) {
          const v = rows[r][src] ?? '';
          if (looksLikeNumber(v)) {
            const x = Number(v);
            out[r][j] = numberText(s.op === 'multiply' ? x * s.factor : x / s.factor);
            s.count++;
          } else {
            out[r][j] = v;
            if (v.trim() !== '' && v.trim() !== '.') nonNumeric++;
          }
        }
      } else {
        for (let r = 0; r < rows.length; r++) out[r][j] = rows[r][src] ?? '';
      }
      if (o.verbose) log('DEBUG', `column ${p.name} done (${j + 1}/${outCols.length})`);
      await wait(Math.min(120, 4000 / outCols.length));
    }
    if (nonNumeric) log('WARN', `${nonNumeric} non-numeric cell(s) in scaled columns were left unchanged`);
    log('INFO', `projecting ${outCols.length} of ${headers.length} columns`);

    // level 4: order the rows by masked ID
    if (o.level >= 4) {
      const idj = outCols.findIndex((p) => p.role === 'id' || p.role === 'subject');
      if (idj >= 0) {
        const order = out.map((r, i) => ({ r, i }));
        const num = order.every(({ r }) => looksLikeNumber(r[idj]));
        order.sort((a, b) => (num ? Number(a.r[idj]) - Number(b.r[idj]) : a.r[idj].localeCompare(b.r[idj])) || a.i - b.i);
        order.forEach((x, k) => (out[k] = x.r));
        log('INFO', `rows ordered by masked ${outCols[idj].name} (level 4)`);
      }
    }

    // column renaming
    const renamed: [string, string][] = [];
    const newNames = outCols.map((p) => p.name);
    if (o.renameMode !== 'off') {
      const width = Math.max(2, String(outCols.length).length);
      const taken = new Set(outCols.map((p) => p.name.toLowerCase()));
      outCols.forEach((p, j) => {
        const c = o.columns[p.name];
        const flagged = c?.renameFlag === true;
        const doRename = o.renameMode === 'selected' ? flagged : !flagged;
        if (!doRename) return;
        let nn = o.renameMode === 'selected' && c?.newName ? c.newName : `${o.renamePrefix}${pad(j + 1, width)}`;
        while (!c?.newName && taken.has(nn.toLowerCase())) nn += '_';
        taken.add(nn.toLowerCase());
        newNames[j] = nn;
        renamed.push([p.name, nn]);
        log('INFO', `renamed column ${p.name} -> ${nn}`);
      });
      log('OK', `renamed ${renamed.length} column(s) in the masked dataset (old -> new names are in keymap.txt)`);
    }
    emit({ type: 'step', step: 'mask' });
    await wait(300);

    // ---- write dataset
    const ext = delimiter === 'tab' ? 'tsv' : delimiter === 'comma' ? 'csv' : 'dat';
    const dataName = o.outputName.trim() || `obfuscated.${ext}`;
    const d = delimiter;
    const fmtRow = (r: string[]) => (d === 'space' ? r.join(' ') : r.map((v) => quoteField(v, d)).join(DELIM_CHAR[d]));
    const dataset = [fmtRow(newNames), ...out.map(fmtRow)].join('\n') + '\n';
    const hash = await sha256(dataset);
    log('OK', `wrote dataset ./masked/${dataName} (${out.length} rows × ${newNames.length} cols)`);
    log('OK', `dataset SHA-256 ${hash} (identical on every re-run of this simulation with the same input, options and seed ${o.seed})`);
    emit({ type: 'step', step: 'write' });
    await wait(300);

    // ---- facts used by several reports
    const idName = outCols.findIndex((p) => p.role === 'id');
    const idCol = idName >= 0 ? idName : outCols.findIndex((p) => p.role === 'subject');
    const subjectsOut = idCol >= 0 ? new Set(out.map((r) => r[idCol])).size : 0;
    const subjectsIn = idCol >= 0 ? new Set(rows.map((r) => (r[colIdx.get(outCols[idCol].name)!] ?? '').trim())).size : 0;
    const recodedList = outCols.filter((p) => maps.has(p.name) || (p.role === 'date' && o.level >= 2) || (p.role === 'freetext' && o.level >= 2)).map((p) => p.name);
    const protectedList = outCols.filter((p) => p.role === 'protected').map((p) => p.name);
    const droppedList = plans.filter((p) => !outCols.includes(p)).map((p) => p.name);
    const dateNames = dateCols.filter((p) => outCols.includes(p)).map((p) => p.name);
    const flagLevel = `${o.level} (${LEVEL_NAME[o.level]})`;
    const when = stampShort(started);

    // ---- config.used
    const pairs = optionPairs(o, headers);
    const get = (f: string) => pairs.find(([k]) => k === f)?.[1];
    const configUsed =
      [
        '# resolved options of this SIMULATED run',
        `input = ${input.fileName}`,
        'output = ./masked',
        `level = ${o.level}`,
        `keep = ${o.columns && droppedList.length ? '(all except dropped)' : '(all)'}`,
        `drop = ${droppedList.join(',')}`,
        `id_column = ${get('--id-column') ?? '(auto)'}`,
        `subject_column = ${get('--subject-column') ?? '(auto)'}`,
        `study_column = ${get('--study-column') ?? '(auto)'}`,
        `site_column = ${get('--site-column') ?? '(auto)'}`,
        `treatment_column = ${get('--treatment-column') ?? '(auto)'}`,
        `user_column = ${get('--user-column') ?? '(auto)'}`,
        `date_columns = ${get('--date-columns') ?? ''}`,
        `sensitive = ${get('--sensitive') ?? ''}`,
        `protect = ${get('--protect') ?? DEFAULT_PROTECT.join(',')}`,
        `scale_columns = ${get('--scale-columns') ?? ''}`,
        `freetext_columns = ${get('--freetext-columns') ?? ''}`,
        `seed = ${o.seed}`,
        `delimiter = ${o.delimiter}`,
        `no_header = ${o.noHeader}`,
        `id_style = ${o.idStyle}`,
        `scale_range = ${o.scaleMin}-${o.scaleMax}`,
        o.dateShiftMode === 'fixed' ? `date_shift_days = ${o.dateShiftFixed}` : `date_shift_min = ${o.dateShiftMin}\ndate_shift_max = ${o.dateShiftMax}`,
        `rename_columns = ${get('--rename-columns') ?? ''}`,
        `rename_except = ${get('--rename-except') ?? ''}`,
        `rename_prefix = ${o.renamePrefix}`,
        `write_keymap = ${o.writeKeymap}`,
        `output_name = ${o.outputName.trim() || '(auto)'}`,
        `comment_chars = ${o.commentChars}`,
        `drop_freetext = ${o.dropFreetext}`,
        `verbose = ${o.verbose}`,
      ].join('\n') + '\n';

    // ---- column report
    const roleLabel = (p: Plan) => (p.role === 'protected' ? 'protect' : p.userRole === 'sensitive' ? 'sensitive' : p.role === 'other' ? '-' : p.role);
    const actionText = (p: Plan): string => {
      if (!outCols.includes(p)) return p.keep ? 'dropped (free text, level 4)' : 'dropped (by you)';
      if (p.role === 'protected') return 'protected (unchanged)';
      if (maps.has(p.name)) return 'recoded';
      if (p.role === 'date' && o.level >= 2) return 'date-shifted';
      if (p.role === 'freetext' && o.level >= 2) return 'redacted';
      if (scales.has(p.name)) return 'scaled (x or / hidden factor)';
      return 'passed through';
    };
    const yn = (b: boolean) => (b ? 'yes' : 'no');
    const colReport =
      [
        'DATA OBFUSCATOR — COLUMN REPORT (browser simulation)',
        '=====================================================',
        '',
        'COLUMN'.padEnd(16) + 'ROLE'.padEnd(13) + 'RECODE'.padEnd(9) + 'SCALE'.padEnd(9) + 'REDACT'.padEnd(9) + 'DROP'.padEnd(9) + 'ACTION',
        '-'.repeat(80),
        ...plans.map((p) => {
          const a = actionText(p);
          return (
            p.name.padEnd(16) +
            roleLabel(p).padEnd(13) +
            yn(a === 'recoded').padEnd(9) +
            yn(a.startsWith('scaled')).padEnd(9) +
            yn(a === 'redacted').padEnd(9) +
            yn(a.startsWith('dropped')).padEnd(9) +
            a
          );
        }),
        '',
        `Input columns:  ${headers.join(', ')}`,
        `Output columns: ${newNames.join(', ')}`,
        ...(renamed.length ? ['', 'Renamed columns (this report shows the ORIGINAL names - do not share it):', ...renamed.map(([a, b]) => `  ${a} -> ${b}`)] : []),
      ].join('\n') + '\n';

    // ---- keymap
    const sections: string[] = [];
    const secList: string[] = [];
    const sec = (title: string, detail: string) => secList.push(`${secList.length + 1}. ${title}`.padEnd(36) + detail);
    if (renamed.length) sec('COLUMN RENAMING', `${renamed.length} column(s) renamed`);
    if (scales.size) sec('NUMERIC SCALING', `${scales.size} column(s) multiplied or divided`);
    if (dateNames.length && o.level >= 2) sec('DATE SHIFT', `${shift} day(s) added to: ${dateNames.join(', ')}`);
    const recodeCount = [...maps.values()].reduce((a, m) => a + m.size, 0);
    if (maps.size) sec('IDENTIFIER AND LABEL RECODING', `${recodeCount} value(s) in ${maps.size} column(s)`);
    const rule = '# ' + '-'.repeat(78);
    if (renamed.length) {
      sections.push(
        rule,
        '# COLUMN RENAMING - column names that were changed in the masked dataset.',
        '# Format: renamed_column<TAB>original name<TAB>new name',
        rule,
        ...renamed.map(([a, b]) => `renamed_column\t${a}\t${b}`),
        '#',
      );
    }
    if (scales.size) {
      sections.push(
        rule,
        '# NUMERIC SCALING - every valid number in the column was multiplied or divided by the factor.',
        '# To restore the original: masked value divided by factor (multiply) or times factor (divide).',
        "# Blank, '.' and text cells are unchanged. Format: column<TAB>operation<TAB>factor<TAB>values changed",
        rule,
        ...[...scales].map(([c, s]) => `${c}\t${s.op}\t${s.factor}\t${s.count}`),
        '#',
      );
    }
    if (dateNames.length && o.level >= 2) {
      sections.push(
        rule,
        '# DATE SHIFT - one number of days (a decimal, e.g. 23.6) was ADDED to every date in the',
        '# date columns. It is the same for the whole dataset, so intervals between dates are preserved.',
        '# Date-only text dates moved by the whole days only. To restore the originals, subtract the same amount.',
        '# Format: name<TAB>days<TAB>columns',
        rule,
        `date_shift_days\t${shift}\t${dateNames.join(',')}`,
        `date_shift_whole_days\t${Math.trunc(shift)}\t${dateNames.join(',')}`,
        '#',
      );
    }
    if (maps.size) {
      sections.push(rule, '# IDENTIFIER AND LABEL RECODING - original value and what it became.', '# Format: column<TAB>original<TAB>masked', rule, 'column\toriginal\tmasked');
      for (const [c, m] of [...maps].sort((a, b) => a[0].localeCompare(b[0]))) {
        for (const [orig, masked] of [...m].sort((a, b) => a[0].localeCompare(b[0]))) sections.push(`${c}\t${orig}\t${masked}`);
      }
    }
    const bar = '# ' + '='.repeat(78);
    const keymap =
      [
        bar,
        '#  DATA OBFUSCATOR  -  DE-IDENTIFICATION KEY  (keymap.txt)   [browser simulation]',
        '#  The secret that turns the masked dataset back into the original.',
        bar,
        '#',
        '#  !! CONFIDENTIAL - KEEP OFFLINE !!',
        '#  Anyone who holds this file together with the masked dataset can undo the masking.',
        '#  Never send it to an LLM, a vendor, a CRO or a collaborator.',
        '#',
        `#  Source dataset  : ${input.fileName}`,
        `#  Masked dataset  : ${dataName}`,
        `#  Masked SHA-256  : ${hash}`,
        `#  Masking level   : ${flagLevel}`,
        `#  Random seed     : ${o.seed}`,
        `#  ID style        : ${o.idStyle}`,
        '#',
        '#  WHAT IS IN THIS FILE',
        ...secList.map((s) => '#    ' + s),
        '#',
        "#  Lines that start with '#' are comments. Every other line is TAB-separated.",
        bar,
        '#',
        ...sections,
      ].join('\n') + '\n';

    // ---- llm.txt facts
    const evidJ = outCols.findIndex((p) => normName(p.name) === 'EVID');
    const dvJ = outCols.findIndex((p) => normName(p.name) === 'DV');
    const amtJ = outCols.findIndex((p) => normName(p.name) === 'AMT');
    const timeJ = outCols.findIndex((p) => normName(p.name) === 'TIME');
    const obsRows = out.filter((r) => (evidJ >= 0 ? r[evidJ] === '0' : dvJ >= 0 && looksLikeNumber(r[dvJ])));
    const obsNumeric = dvJ >= 0 ? obsRows.filter((r) => looksLikeNumber(r[dvJ])) : [];
    const doseRows = out.filter((r) => (evidJ >= 0 ? r[evidJ] === '1' : amtJ >= 0 && looksLikeNumber(r[amtJ]) && Number(r[amtJ]) > 0));
    const amts = amtJ >= 0 ? new Set(doseRows.map((r) => r[amtJ]).filter((v) => looksLikeNumber(v))) : new Set<string>();
    const times = timeJ >= 0 ? out.map((r) => Number(r[timeJ])).filter((x) => Number.isFinite(x)) : [];
    const perSubj: number[] = [];
    if (idCol >= 0) {
      const c = new Map<string, number>();
      for (const r of out) c.set(r[idCol], c.get(r[idCol]) ?? 0);
      for (const r of obsNumeric) c.set(r[idCol], (c.get(r[idCol]) ?? 0) + 1);
      perSubj.push(...c.values());
      perSubj.sort((a, b) => a - b);
    }
    const median = perSubj.length ? perSubj[Math.floor(perSubj.length / 2)] : 0;
    const covList = outCols.map((p, j) => (['sex', 'race', 'country', 'covariate'].includes(p.role) ? newNames[j] : '')).filter(Boolean);
    const scaledNew = outCols.map((p, j) => (scales.has(p.name) ? newNames[j] : '')).filter(Boolean);
    const trtJ = outCols.findIndex((p) => p.role === 'treatment');
    const trtSet = trtJ >= 0 ? [...new Set(out.map((r) => r[trtJ]))] : [];
    const dsDesc = `${dataName}`;
    const factsBlock = [
      'DATASET FACTS (computed from the masked file)',
      `  Records / columns   : ${out.length} / ${newNames.length}`,
      `  Columns             : ${newNames.join(', ')}`,
      idCol >= 0 ? `  Subjects            : ${subjectsOut} (column ${newNames[idCol]})` : '  Subjects            : no ID column found',
      dvJ >= 0 ? `  Observations        : ${obsNumeric.length} analysable of ${obsRows.length} observation records (DV column ${newNames[dvJ]})` : '',
      amtJ >= 0 ? `  Dosing              : ${doseRows.length} dosing records across ${amts.size} distinct AMT value(s)${amts.size === 1 ? ` (${[...amts][0]})` : ''}` : '',
      times.length ? `  TIME range          : ${Math.min(...times)} to ${Math.max(...times)} (units not recorded)` : '',
      perSubj.length ? `  Obs per subject     : min ${perSubj[0]}, median ${median}, max ${perSubj[perSubj.length - 1]}` : '',
      scaledNew.length ? `  Rescaled columns    : ${scaledNew.join(', ')} (each multiplied or divided by a hidden constant; values are not physiological)` : '',
      renamed.length ? `  Renamed columns     : ${renamed.map(([, b]) => b).join(', ')} (original names withheld; their meaning is unknown)` : '',
      trtSet.length ? `  Treatment groups    : ${trtSet.length} in ${newNames[trtJ]} (${trtSet.slice(0, 6).join(', ')}; labels are masked and arbitrary)` : '',
      covList.length ? `  Covariates          : ${covList.join(', ')}` : '',
    ].filter(Boolean);
    const llm =
      [
        'DATA OBFUSCATOR - LLM PROMPT PACK  (browser simulation)',
        '======================================================',
        `Generated on ${when}`,
        `Masked dataset: ${dsDesc}   |   masking level ${flagLevel}`,
        '',
        'HOW TO USE',
        `  1. Attach '${dsDesc}' to your LLM chat and paste ONE of the three prompts below.`,
        '  2. Share only the masked dataset and this prompt text. Never share keymap.txt or the original file.',
        '  3. Add the units yourself (for example "time in hours, DV in ng/mL, AMT in mg").',
        '',
        ...factsBlock,
        '',
        '1. ANALYZE THE DATA',
        '-------------------',
        `You are an experienced pharmacometrician. The attached file ${dsDesc} is a NONMEM-style dataset with ${out.length} records`,
        `${idCol >= 0 ? `and ${subjectsOut} subjects` : ''}. Identifiers and labels were replaced by codes, and some columns were rescaled by hidden`,
        'constants, so ignore absolute covariate values. Describe the study design, then summarise the concentration-time profile by',
        'treatment group, check for outliers and for missing data, and suggest a structural model with a rationale.',
        '',
        '2. CREATE A NONMEM CONTROL STREAM',
        '---------------------------------',
        `Write a NONMEM control stream for ${dsDesc}. Use the columns exactly as named in the file. Start with a one- or two-compartment`,
        'model with first-order absorption if the data support it, add log-normal between-subject variability on CL and V, a',
        'proportional residual error, and explain every $-block. List the assumptions you made about units.',
        '',
        '3. QUALITY-CHECK THE DATA',
        '-------------------------',
        `Review ${dsDesc} as a data programmer would before modelling. Check EVID/MDV/CMT consistency, time ordering within`,
        'subject, duplicated records, dose records without observations and the opposite, and impossible values. Report findings as a',
        'table with the row numbers and a proposed fix for each.',
        '',
      ].join('\n');

    // ---- summary
    const summary =
      [
        'DATA OBFUSCATOR — RUN SUMMARY  (browser simulation)',
        '===================================================',
        `Generated: ${when}`,
        `Program:   ${SIM_VERSION} (this is NOT the real program)`,
        'Command:   run',
        '',
        'INPUT',
        `  File:            ${input.fileName}`,
        `  Format:          ${fmt} (${delimName})`,
        `  Rows:            ${rows.length}`,
        `  Columns (in):    ${headers.length}`,
        idCol >= 0 ? `  Subjects (ID):   ${subjectsIn}` : null,
        `  Bytes:           ${bytes(input.text)}`,
        '',
        'OUTPUT',
        `  File:            ${dataName}`,
        `  Rows:            ${out.length}`,
        `  Columns (out):   ${newNames.length}`,
        idCol >= 0 ? `  Subjects (ID):   ${subjectsOut}` : null,
        `  SHA-256:         ${hash}`,
        '',
        'OBFUSCATION',
        `  Level:           ${flagLevel}`,
        `  Seed:            ${o.seed}`,
        `  ID style:        ${o.idStyle}`,
        `  Columns recoded: ${recodedList.join(', ') || '(none)'}`,
        `  Columns dropped: ${droppedList.join(', ') || '(none)'}`,
        `  Columns kept:    ${newNames.join(', ')}`,
        renamed.length ? `  Renamed columns: ${renamed.map(([a, b]) => `${a} -> ${b}`).join(', ')}` : null,
        dateNames.length && o.level >= 2 ? `  Date shift:      ${shift} days (one value for the whole dataset; intervals preserved; exact value in keymap.txt)` : null,
        scales.size ? `  Scaling:         ${[...scales.keys()].join(', ')} multiplied or divided by a hidden factor in ${o.scaleMin}-${o.scaleMax}` : null,
        `  Keymap written:  ${o.writeKeymap ? 'yes — DO NOT share keymap.txt with any LLM or external party' : 'no'}`,
        '',
        'INTEGRITY',
        `  Protected columns untouched:    ${protectedList.join(', ') || '(none)'}`,
        `  Unique ID count unchanged:      ${idCol < 0 ? 'n/a' : subjectsIn === subjectsOut ? 'yes' : 'NO'}`,
        '',
        'STATUS: SUCCESS (simulation)',
      ]
        .filter((l): l is string => l !== null)
        .join('\n') + '\n';

    log('OK', 'wrote ./masked/config.used.txt');
    log('OK', 'wrote ./masked/column_report.txt');
    if (o.writeKeymap) log('OK', 'wrote key map ./masked/keymap.txt (original values, scaling factors, date shift) - keep it offline and never share it');
    log('OK', 'wrote ./masked/summary.txt');
    emit({ type: 'step', step: 'reports' });
    await wait(300);
    log('OK', 'wrote ./masked/llm.txt (analysis, NONMEM control-stream and QC prompts tailored to the dataset)');
    emit({ type: 'step', step: 'prompts' });
    await wait(250);

    // ---- tokens
    const tIn = estimateTokens(input.text);
    const tOut = estimateTokens(dataset);
    const others: [string, string][] = [
      ['column_report.txt', colReport],
      ['config.used.txt', configUsed],
      ...(o.writeKeymap ? ([['keymap.txt', keymap]] as [string, string][]) : []),
      ['llm.txt', llm],
      ['summary.txt', summary],
    ];
    const tOther = others.reduce((a, [, t]) => a + estimateTokens(t), 0);
    const row = (n: string, b: number, t: number) => `  ${n.padEnd(32)}${String(b).padStart(8)}${String(t).padStart(12)}`;
    const tokens =
      [
        'DATA OBFUSCATOR — TOKEN REPORT  (browser simulation: rough estimates)',
        '=====================================================================',
        '',
        `${'FILE'.padEnd(34)}${'BYTES'.padStart(8)}${'TOKENS'.padStart(12)}`,
        '-'.repeat(54),
        'INPUT',
        row(input.fileName, bytes(input.text), tIn),
        '',
        'OUTPUT DATASET',
        row(dataName, bytes(dataset), tOut),
        '',
        'OTHER OUTPUT FILES (excluding log)',
        ...others.map(([n, t]) => row(n, bytes(t), estimateTokens(t))),
        '',
        '-'.repeat(54),
        row('TOTAL INPUT', bytes(input.text), tIn),
        row('TOTAL OUTPUT DATASET', bytes(dataset), tOut),
        row('TOTAL OTHER FILES', others.reduce((a, [, t]) => a + bytes(t), 0), tOther),
        '',
        'MULTI-MODEL ESTIMATES (approximate)',
        `${'MODEL'.padEnd(52)}${'INPUT'.padStart(8)}${'OUT DATA'.padStart(10)}${'OTHER'.padStart(8)}`,
        '-'.repeat(78),
        ...MODEL_FACTORS.map(
          ([n, f]) => n.padEnd(52) + String(Math.round(tIn * f)).padStart(8) + String(Math.round(tOut * f)).padStart(10) + String(Math.round(tOther * f)).padStart(8),
        ),
        '',
        'Tokens were estimated in the browser; the real program counts more carefully.',
      ].join('\n') + '\n';
    log('OK', `wrote ./masked/tokens.txt (input ${tIn} tokens, output ${tOut} tokens; rough estimate)`);
    emit({ type: 'step', step: 'tokens' });
    await wait(200);
    log('OK', 'run complete SUCCESS');
    emit({ type: 'step', step: 'done' });

    const logText = logLines.join('\n') + '\n';
    const list: [string, string][] = [
      [dataName, dataset],
      ['llm.txt', llm],
      ['tokens.txt', tokens],
      ...(o.writeKeymap ? ([['keymap.txt', keymap]] as [string, string][]) : []),
      ['summary.txt', summary],
      ['column_report.txt', colReport],
      ['config.used.txt', configUsed],
      ['obfuscator.log', logText],
    ];
    const files: ResultFile[] = list.map(([name, text]) => ({ name, size: bytes(text), text }));
    emit({ type: 'done', files, warnings });
    return { files, warnings };
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      emit({ type: 'fail', message: 'Cancelled.' });
      return null;
    }
    return fail(e instanceof Error ? e.message : String(e));
  }
}
