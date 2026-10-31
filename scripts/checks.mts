// Quick checks of the shared option logic and the run2 simulation. Run: npm run check
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseDelimited } from '../src/shared/csv.ts';
import { DEFAULT_PROTECT } from '../src/shared/detect.ts';
import { buildArgs, defaultOptions, optionPairs, validateOptions } from '../src/shared/options.ts';
import { effectiveProtect, planColumns, effectOf } from '../src/shared/plan.ts';
import { simulateRun2 } from '../src/shared/mockRun2.ts';
import { roleChoicesFor } from '../src/lib/labels.ts';
import { detectStep } from '../src/shared/steps.ts';
import { uploadNames, maskedMatch } from '../src/shared/files.ts';

const sample = parseDelimited(readFileSync('./public/samples/sample.csv', 'utf8'));
const H = sample.headers;
const flag = (pairs: [string, string?][], f: string) => pairs.find(([k]) => k === f)?.[1];

// 1. nothing changed -> no --protect flag
let o = defaultOptions(H);
o.level = 3;
assert.equal(flag(optionPairs(o, H), '--protect'), undefined);

// 2. scaling DV on purpose takes DV off the list that is sent (the program silently skips protected columns)
o.columns.DV.role = 'covariate';
const p2 = flag(optionPairs(o, H), '--protect')!;
assert.ok(p2 && !p2.split(',').includes('DV'), 'DV must be left off the protect list');
assert.equal(flag(optionPairs(o, H), '--scale-columns'), 'DV');
assert.equal(effectOf(planColumns(H, o).find((p) => p.name === 'DV')!, o).kind, 'scale');

// 3. a user-added protected column is sent with the standard names
o = defaultOptions(H);
o.level = 3;
o.protect = [...DEFAULT_PROTECT, 'WT'];
assert.ok(flag(optionPairs(o, H), '--protect')!.split(',').includes('WT'));
assert.equal(effectOf(planColumns(H, o).find((p) => p.name === 'WT')!, o).kind, 'protect');
// ... but below level 3 the editable list is ignored
o.level = 2;
assert.equal(flag(optionPairs(o, H), '--protect'), undefined);

// 4. a standard name taken off the list stays protected by its name unless it is scaled
o = defaultOptions(H);
o.level = 3;
o.protect = DEFAULT_PROTECT.filter((n) => n !== 'DV');
assert.equal(effectOf(planColumns(H, o).find((p) => p.name === 'DV')!, o).kind, 'protect');

// 5. an empty list is sent as an empty value
o.protect = [];
assert.equal(flag(optionPairs(o, H), '--protect'), '');
assert.ok(buildArgs(o, H, ['a.csv'], 'out').includes('--protect='));

// 6. Treat as: only choices that do something at the level
const vals = (l: 1 | 2 | 3 | 4, cur = 'auto' as const) => roleChoicesFor(l, cur).map((r) => r.value);
assert.deepEqual(vals(1), ['auto', 'id', 'subject', 'study', 'site', 'user', 'sensitive', 'protect']);
assert.ok(vals(2).includes('date') && vals(2).includes('freetext') && vals(2).includes('treatment') && !vals(2).includes('covariate'));
assert.ok(vals(3).includes('covariate') && vals(4).includes('covariate'));
assert.ok(roleChoicesFor(1, 'covariate').some((r) => r.value === 'covariate' && /no effect at level 1/.test(r.label)), 'a chosen role stays visible, marked');
// an explicit treatment column does nothing at level 1 (the program passes it through)
o = defaultOptions(H);
o.level = 1;
o.columns.ARM.role = 'treatment';
assert.equal(effectOf(planColumns(H, o).find((p) => p.name === 'ARM')!, o).kind, 'pass');

// 7. several datasets -> run2
const names = ['adsl', 'adex', 'adpc', 'adlb', 'advs', 'adae'];
const texts = names.map((n) => readFileSync(`./public/samples/adam/${n}.csv`, 'utf8'));
const heads = [...new Set(texts.flatMap((t) => parseDelimited(t).headers))];
const m = defaultOptions(heads);
m.level = 3;
m.seed = 20261014;
for (const c of ['WEIGHTBL', 'CRCLBL']) m.columns[c].role = 'covariate';
for (const c of ['COMMENT', 'CONTACT', 'AETERM']) m.columns[c].role = 'freetext';
m.renameMode = 'selected';
m.outputName = 'x.csv';
m.noHeader = true;
const args = buildArgs(m, heads, names.map((n) => `./in/${n}.csv`), './out');
assert.equal(args[1], 'run2');
assert.equal(args.filter((a) => a.startsWith('--input=')).length, 6);
for (const bad of ['--rename-columns', '--output-name', '--no-header', '--columns']) assert.ok(!args.some((a) => a.startsWith(bad)), `${bad} must not be sent to run2`);
assert.ok(validateOptions({ ...m, level: 4 }, heads, true)[0]?.includes('levels 1 to 3'));
m.adamHints = false;
assert.ok(buildArgs(m, heads, ['a', 'b'], 'o').includes('--adam-hints=false'));
m.adamHints = true;
assert.equal(buildArgs(m, heads, ['a'], 'o')[1], 'run');

// ADaM names are detected like the program does (run2 only)
const planM = planColumns(heads, m, true);
const role = (n: string) => planM.find((p) => p.name === n)!.role;
assert.equal(role('ADT'), 'date');
assert.equal(role('EXSTDTC'), 'date');
assert.equal(role('TRT01P'), 'treatment');
assert.equal(role('INVNAM'), 'user');
assert.equal(planColumns(heads, m, false).find((p) => p.name === 'ADT')!.role, 'other');

// 8. step detection for run2 lines
assert.equal(detectStep('2026-10-15 13:24:30.825 UTC [OK] read adsl.csv (18 rows x 18 columns, CSV (comma))'), 'read');
assert.equal(detectStep('2026-10-15 13:24:30.840 UTC [INFO] date shift (one value for all 6 dataset(s), intervals preserved): 17 days'), 'plan');
assert.equal(detectStep('2026-10-15 13:24:30.841 UTC [OK] domain study: 1 unique value(s) in column(s) STUDYID, one code table shared by all datasets'), 'mask');
assert.equal(detectStep('2026-10-15 13:24:30.843 UTC [OK] wrote ./out/adsl_masked.csv (18 rows x 18 columns)'), 'write');
assert.equal(detectStep('2026-10-15 13:24:30.844 UTC [OK] wrote ./out/keymap2.txt - PRIVATE: it holds'), 'reports');
assert.equal(detectStep('2026-10-15 13:24:30.844 UTC [OK] wrote ./out/llm2.txt (ready-to-paste prompts)'), 'prompts');
assert.equal(detectStep('2026-10-15 13:24:30.845 UTC [OK] run2 complete SUCCESS'), 'done');
assert.equal(detectStep('2026-10-15 13:24:30.845 UTC [INFO] run2: 6 dataset(s), level 3, seed 1'), null);

// 9. upload names: unique, safe, and matched to the masked files
assert.deepEqual(uploadNames(['a b.csv', 'a_b.csv', '../x.tsv']), ['a_b.csv', 'a_b_2.csv', 'x.tsv']);
assert.ok(maskedMatch('adsl_masked.csv', 'adsl.csv') && !maskedMatch('adsl_masked.csv', 'adex.csv'));

// 10. the run2 simulation: shared codes, one whole-day shift, one factor per column, the right files
const events: string[] = [];
const sim = await simulateRun2({ files: names.map((n, i) => ({ name: `${n}.csv`, text: texts[i] })), options: m }, (e) => e.type === 'step' && events.push(e.step), { speed: 0 });
assert.ok(sim, 'simulation finished');
const out = (n: string) => parseDelimited(sim!.files.find((f) => f.name === n)!.text!);
assert.deepEqual(sim!.files.map((f) => f.name).sort(), [...names.map((n) => `${n}_masked.csv`), 'config.used.txt', 'keymap2.txt', 'llm2.txt', 'run2.log', 'summary2.txt'].sort());
const a = out('adsl_masked.csv');
const b = out('adpc_masked.csv');
const ia = a.headers.indexOf('USUBJID');
const ib = b.headers.indexOf('USUBJID');
assert.match(a.rows[0][ia], /^SUBJ\d{3}$/);
assert.ok(new Set(b.rows.map((r) => r[ib])).size <= new Set(a.rows.map((r) => r[ia])).size * 2, 'subject codes come from one table');
assert.equal(a.rows[0][a.headers.indexOf('COMMENT')], '.');
const dsl = parseDelimited(texts[0]);
const shiftOf = (orig: string, masked: string) => Math.round((Date.parse(masked) - Date.parse(orig)) / 86400000);
const sd = shiftOf(dsl.rows[0][dsl.headers.indexOf('TRTSDT')], a.rows[0][a.headers.indexOf('TRTSDT')]);
const dex = parseDelimited(texts[1]);
const ex = out('adex_masked.csv');
assert.equal(shiftOf(dex.rows[0][dex.headers.indexOf('EXSTDTC')].slice(0, 10), ex.rows[0][ex.headers.indexOf('EXSTDTC')].slice(0, 10)), sd, 'every dataset moves by the same days');
const dlb = parseDelimited(texts[3]);
assert.equal(dlb.rows[0][dlb.headers.indexOf('AVAL')], out('adlb_masked.csv').rows[0][dlb.headers.indexOf('AVAL')], 'AVAL is not scaled');
assert.ok(events.includes('read') && events.includes('done') && !events.includes('tokens'));
assert.ok(sim!.files.find((f) => f.name === 'llm2.txt')!.text!.includes('## Prompt 1 - '));
// level 4 is refused
const l4 = await simulateRun2({ files: names.slice(0, 2).map((n, i) => ({ name: `${n}.csv`, text: texts[i] })), options: { ...m, level: 4 } }, () => undefined, { speed: 0 });
assert.equal(l4, null);

console.log('all checks passed');
