// In-browser SIMULATION of `data-obfuscator run2` (several datasets masked together).
// Like the single-file simulation it follows the program's rules closely enough to show the result and
// prints the same log lines, but it is a demonstration, not byte-identical to the real program.

import { DELIM_CHAR, parseDelimited, quoteField } from './csv';
import { adamRole, detectRole, looksLikeNumber, type Role } from './detect';
import { SIM_VERSION, bytes, mulberry32, numberText, pad, sha256, shiftDate, sleep, stamp } from './mockEngine';
import { optionPairs } from './options';
import { planColumns } from './plan';
import { uploadNames } from './files';
import type { Options, ResultFile, RunEvent } from './types';

export interface SimInput2 {
  files: { name: string; text: string }[];
  options: Options;
}

type Domain = 'study' | 'subject' | 'site' | 'user' | 'treatment' | 'sex' | 'race' | 'country' | 'id' | 'sensitive';
const DOMAIN_OF: Partial<Record<Role, Domain>> = { id: 'id', subject: 'subject', study: 'study', site: 'site', user: 'user', treatment: 'treatment', sex: 'sex', race: 'race', country: 'country' };
const LEVEL_NAME: Record<number, string> = { 1: 'light', 2: 'clinical', 3: 'covariate masking' };

function code(domain: Domain, n: number): string {
  switch (domain) {
    case 'id':
      return String(n);
    case 'subject':
      return `SUBJ${pad(n, 3)}`;
    case 'study':
      return `STU${pad(n, 3)}`;
    case 'site':
      return `SITE${pad(n, 3)}`;
    case 'user':
      return `USER${pad(n, 3)}`;
    case 'treatment':
      return `ARM_${String.fromCharCode(65 + ((n - 1) % 26))}`;
    case 'sex':
      return String(n - 1);
    case 'race':
      return `CAT${pad(n, 3)}`;
    case 'country':
      return `C${pad(n, 3)}`;
    default:
      return `ID_${pad(n, 3)}`;
  }
}

export async function simulateRun2(input: SimInput2, emit: (e: RunEvent) => void, opts: { signal?: AbortSignal; speed?: number } = {}): Promise<{ files: ResultFile[]; warnings: number } | null> {
  const o = input.options;
  const speed = opts.speed ?? 1;
  const wait = (ms: number) => sleep(ms * speed, opts.signal);
  const logLines: string[] = [];
  let warnings = 0;
  const log = (level: 'INFO' | 'OK' | 'WARN' | 'ERROR', text: string) => {
    if (level === 'WARN') warnings++;
    const line = `${stamp(new Date())} [${level}] ${text}`;
    logLines.push(line);
    emit({ type: 'log', level: level.toLowerCase() as 'info', text: line });
  };
  const fail = (message: string): null => {
    log('ERROR', message);
    emit({ type: 'fail', message });
    return null;
  };

  try {
    if (o.level >= 4) return fail('run2 supports levels 1 to 3. Level 4 re-sorts rows, which cannot be traced through a combined dataset.');
    const names = uploadNames(input.files.map((f) => f.name));
    log('INFO', `log opened path=./masked2/run2.log pid=0 version=${SIM_VERSION} (browser SIMULATION, not the real program)`);
    log('INFO', `run2: ${input.files.length} dataset(s), level ${o.level}, seed ${o.seed}`);
    await wait(250);

    // ---- read
    const tables = input.files.map((f) => parseDelimited(f.text, { delimiter: o.delimiter, commentChars: o.commentChars }));
    for (let i = 0; i < tables.length; i++) {
      const t = tables[i];
      if (!t.rows.length) return fail(`${names[i]} has no data rows.`);
      if (t.headers.length < 2) return fail(`${names[i]} has fewer than 2 columns. Check the delimiter setting.`);
      const fmt = t.delimiter === 'comma' ? 'CSV (comma)' : t.delimiter === 'tab' ? 'TSV (tab)' : t.delimiter === 'semicolon' ? 'semicolon-delimited' : 'whitespace-delimited';
      log('OK', `read ${names[i]} (${t.rows.length} rows x ${t.headers.length} columns, ${fmt})`);
      await wait(120);
    }
    emit({ type: 'step', step: 'read' });
    await wait(200);

    // ---- plan
    const plans = tables.map((t) => planColumns(t.headers, o, true));
    plans.forEach((ps, i) => {
      for (const p of ps) {
        if (p.userRole === 'auto' && o.adamHints && detectRole(p.name) === 'other' && adamRole(p.name) !== 'other' && p.role === adamRole(p.name)) {
          log('INFO', `${names[i]}: column ${p.name} recognised as ${p.role} (ADaM naming)`);
        }
      }
    });
    const rand = mulberry32(o.seed);
    let shift = 0;
    if (o.level >= 2) {
      if (o.dateShiftMode === 'fixed') shift = o.dateShiftFixed;
      else {
        const lo = Math.ceil(Math.min(o.dateShiftMin, o.dateShiftMax));
        const hi = Math.max(lo, Math.floor(Math.max(o.dateShiftMin, o.dateShiftMax)));
        shift = lo + Math.floor(rand() * (hi - lo + 1));
      }
      if (shift % 1 !== 0) log('WARN', `date shift ${shift} is not a whole number of days: date-only and date-time columns will disagree by the fraction. Use a whole number of days`);
      log('INFO', `date shift (one value for all ${tables.length} dataset(s), intervals preserved): ${shift} days`);
    }
    const scales = new Map<string, { op: 'multiply' | 'divide'; factor: number }>();
    if (o.level >= 3) {
      const lo = Math.min(o.scaleMin, o.scaleMax);
      const hi = Math.max(o.scaleMin, o.scaleMax);
      for (const ps of plans) {
        for (const p of ps) {
          if (p.keep && p.role === 'covariate' && !scales.has(p.name.toUpperCase())) {
            const factor = Number((lo + rand() * (hi - lo)).toFixed(10));
            const op: 'multiply' | 'divide' = rand() < 0.5 ? 'multiply' : 'divide';
            scales.set(p.name.toUpperCase(), { op, factor });
            log('INFO', `scaling column ${p.name}: every valid number in every dataset will be ${op === 'multiply' ? 'multiplied' : 'divided'} by ${factor}`);
          }
        }
      }
    }
    emit({ type: 'step', step: 'plan' });
    await wait(250);

    // ---- mask
    const tablesByDomain = new Map<Domain, Map<string, string>>();
    const domainCols = new Map<Domain, Set<string>>();
    const domainFor = (role: Role, userRole: string, level: number): Domain | null => {
      if (userRole === 'sensitive') return 'sensitive';
      const d = DOMAIN_OF[role];
      if (!d) return null;
      if (['treatment', 'sex', 'race', 'country'].includes(d) && level < 2) return null;
      return d;
    };
    const dropFree = o.dropFreetext;
    const outputs = tables.map((t, i) => {
      const ps = plans[i];
      const cols = ps.filter((p) => p.keep && !(p.role === 'freetext' && dropFree));
      const rows = t.rows.map((r) => cols.map((p) => r[p.index] ?? ''));
      cols.forEach((p, j) => {
        const dom = domainFor(p.role, p.userRole, o.level);
        if (dom) {
          const map = tablesByDomain.get(dom) ?? new Map<string, string>();
          tablesByDomain.set(dom, map);
          (domainCols.get(dom) ?? domainCols.set(dom, new Set()).get(dom)!).add(p.name);
          for (const r of rows) {
            const v = r[j].trim();
            if (v === '' || v === '.') continue;
            let m = map.get(v);
            if (m === undefined) {
              m = code(dom, map.size + 1);
              map.set(v, m);
            }
            r[j] = m;
          }
        } else if (p.role === 'date' && o.level >= 2) {
          for (const r of rows) {
            let s = shiftDate(r[j], shift);
            if (s === null && looksLikeNumber(r[j])) s = numberText(Number(r[j]) + shift);
            if (s !== null) r[j] = s;
          }
        } else if (p.role === 'freetext' && o.level >= 2) {
          for (const r of rows) r[j] = r[j].trim() === '' ? '' : '.';
        } else if (scales.has(p.name.toUpperCase())) {
          const s = scales.get(p.name.toUpperCase())!;
          for (const r of rows) if (looksLikeNumber(r[j])) r[j] = numberText(s.op === 'multiply' ? Number(r[j]) * s.factor : Number(r[j]) / s.factor);
        }
      });
      return { cols, rows, delimiter: t.delimiter };
    });
    for (const [dom, map] of tablesByDomain) {
      log('OK', `domain ${dom}: ${map.size} unique value(s) in column(s) ${[...(domainCols.get(dom) ?? [])].join(', ')}, one code table shared by all datasets`);
    }
    emit({ type: 'step', step: 'mask' });
    await wait(250);

    // ---- write the masked datasets
    const written: { source: string; masked: string; text: string; rows: number; cols: number; hash: string; kept: string[] }[] = [];
    const used = new Set<string>();
    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i];
      const d = out.delimiter;
      const ext = d === 'tab' ? 'tsv' : d === 'comma' ? 'csv' : 'dat';
      const stem = names[i].replace(/\.[^.]*$/, '');
      let masked = `${stem}_masked.${ext}`;
      for (let k = 2; used.has(masked.toLowerCase()); k++) masked = `${stem}_masked_${k}.${ext}`;
      used.add(masked.toLowerCase());
      const fmtRow = (r: string[]) => (d === 'space' ? r.join(' ') : r.map((v) => quoteField(v, d)).join(DELIM_CHAR[d]));
      const text = [fmtRow(out.cols.map((p) => p.name)), ...out.rows.map(fmtRow)].join('\n') + '\n';
      const hash = await sha256(text);
      written.push({ source: names[i], masked, text, rows: out.rows.length, cols: out.cols.length, hash, kept: out.cols.map((p) => p.name) });
      log('OK', `wrote ./masked2/${masked} (${out.rows.length} rows x ${out.cols.length} columns)`);
      await wait(120);
    }
    emit({ type: 'step', step: 'write' });
    await wait(200);

    // ---- reports
    const when = new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
    const pairs = optionPairs(o, [...new Set(tables.flatMap((t) => t.headers))], true);
    const configUsed =
      ['# resolved options of this SIMULATED run2', ...names.map((n) => `input = ${n}`), 'output = ./masked2', ...pairs.map(([f, v]) => `${f.replace(/^--/, '').replace(/-/g, '_')} = ${v ?? 'true'}`), `level = ${o.level}`, `seed = ${o.seed}`].join('\n') + '\n';
    const bar = '# ' + '='.repeat(78);
    const keymap =
      [
        bar,
        '#  DATA OBFUSCATOR  -  DE-IDENTIFICATION KEY FOR run2  (keymap2.txt)   [browser simulation]',
        bar,
        '#  !! CONFIDENTIAL - KEEP OFFLINE !! Never send it to an LLM or anyone else.',
        `#  Masking level   : ${o.level} (${LEVEL_NAME[o.level]})`,
        `#  Random seed     : ${o.seed}`,
        '#',
        '# FILES',
        ...written.map((w, i) => `file\t${i + 1}\t${w.source}\t${w.masked}\t${w.hash}`),
        '#',
        ...(o.level >= 2 ? ['# DATE SHIFT (days added to every date column of every dataset)', `date_shift_days\t${shift}`, '#'] : []),
        ...(scales.size ? ['# SCALING (one factor per column name, the same in every dataset)', ...[...scales].map(([c, s]) => `${c}\t${s.op}\t${s.factor}`), '#'] : []),
        '# CODE TABLES (domain, original, masked)',
        ...[...tablesByDomain].flatMap(([dom, map]) => [...map].map(([orig, m]) => `${dom}\t${orig}\t${m}`)),
      ].join('\n') + '\n';
    const summary =
      [
        'DATA OBFUSCATOR - run2 SUMMARY  (browser simulation; PRIVATE: shows the seed and the date shift)',
        '='.repeat(80),
        `Level           : ${o.level} (${LEVEL_NAME[o.level]})`,
        `Seed            : ${o.seed}`,
        `Date shift      : ${o.level >= 2 ? `${shift} day(s)` : 'none (level 1)'}`,
        `ADaM hints      : ${o.adamHints ? 'on' : 'off'}`,
        `Datasets        : ${written.length}`,
        '',
        ...written.flatMap((w, i) => [`${i + 1}. ${w.source} -> ${w.masked}`, `   ${w.rows} rows x ${w.cols} columns; SHA-256 ${w.hash}`, `   kept: ${w.kept.join(', ')}`]),
        '',
        'Shared code tables',
        ...[...tablesByDomain].map(([dom, map]) => `  ${dom.padEnd(10)} ${map.size} value(s); columns ${[...(domainCols.get(dom) ?? [])].join(', ')}`),
        '',
        `Generated ${when}`,
      ].join('\n') + '\n';
    if (o.writeKeymap) log('OK', 'wrote ./masked2/keymap2.txt - PRIVATE: it holds the real identifiers, the date shift and the scaling factors');
    emit({ type: 'step', step: 'reports' });
    await wait(200);

    const scaledNames = [...scales.keys()];
    const llm =
      [
        `# data-obfuscator ${SIM_VERSION} - run2 prompts (browser simulation)`,
        '# Paste ONE prompt below into your LLM together with the *_masked files. Never share keymap2.txt or summary2.txt.',
        '',
        '## What was masked',
        '',
        `${written.length} dataset(s) were masked together, level ${o.level}. Masking is consistent across the datasets:`,
        '- identifiers (subject, study, site, ...) have ONE code table: the same real subject has the same code in every file, so the files can be joined on those columns;',
        ...(o.level >= 2 ? ['- every date was moved by the SAME number of days in every file, so differences between dates are real;'] : []),
        ...(scaledNames.length ? [`- the numeric column(s) ${scaledNames.join(', ')} were multiplied or divided by a hidden constant (one constant per column name, the same in every file);`] : []),
        '',
        '## The datasets',
        '',
        ...written.flatMap((w, i) => [`${i + 1}. ${w.masked} - ${w.rows} rows, ${w.cols} columns`, `   columns: ${w.kept.join(', ')}`]),
        '',
        '## Prompt 1 - build the NONMEM-style master dataset',
        '',
        'You are an experienced pharmacometrician. Combine the attached masked ADaM-style datasets into one NONMEM-style master dataset (ID, TIME, EVID, AMT, DV, CMT and the covariates).',
        '1. Treat every identifier as an opaque code. Join datasets on the columns they share (for example STUDYID + USUBJID). Do not change the codes.',
        '2. Keep the masked identifier columns under their ORIGINAL column names next to the numeric ID you create.',
        '3. Compute TIME from DIFFERENCES between dates and times. Dates are shifted by a constant, which does not matter for TIME.',
        '4. Scaled columns are not in real units. Do not convert units or transform them in place; put derived values in a NEW column.',
        '5. Do not guess real identities, dates or units. If something is missing or ambiguous, say so.',
        '',
        '## Prompt 2 - check the master dataset against the sources',
        '',
        'Check the master dataset you built against the attached source datasets: row counts per subject, doses, observations and covariates. Report any differences as a table.',
        '',
        '## Getting the real values back',
        '',
        'Save the master dataset from the LLM and run: data-obfuscator reverse --input master.csv --keymap keymap2.txt',
        '',
      ].join('\n');
    log('OK', 'wrote ./masked2/llm2.txt (ready-to-paste prompts for combining the datasets)');
    emit({ type: 'step', step: 'prompts' });
    await wait(200);
    log('INFO', 'share with the LLM: the *_masked files and llm2.txt. Keep private: keymap2.txt, summary2.txt, config.used.txt, run2.log');
    log('OK', 'run2 complete SUCCESS');
    emit({ type: 'step', step: 'done' });

    const list: [string, string][] = [
      ...written.map((w) => [w.masked, w.text] as [string, string]),
      ['llm2.txt', llm],
      ...(o.writeKeymap ? ([['keymap2.txt', keymap]] as [string, string][]) : []),
      ['summary2.txt', summary],
      ['config.used.txt', configUsed],
      ['run2.log', logLines.join('\n') + '\n'],
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

