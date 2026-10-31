import { useId, useState } from 'react';
import { LEVELS } from '../lib/labels';
import { DEFAULT_PROTECT, normName } from '../shared/detect';
import { PROTECT_NAME_RE } from '../shared/options';
import { sameNames, scaledOnPurpose } from '../shared/plan';
import type { IdStyle, Level, Options, RenameMode } from '../shared/types';
import { Button, Field, NumberInput, Segmented, TextInput, Toggle, Icon } from './ui';

type SetOpts = (patch: Partial<Options>) => void;

function Group({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <div className="border-b border-line px-5 py-4 last:border-b-0">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">{title}</h3>
        {note && <span className="text-[12px] text-faint">{note}</span>}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}


/** Edit the list of columns that must never be altered. Shown from level 3, where numbers are scaled. */
function ProtectEditor({ o, set, headers }: { o: Options; set: SetOpts; headers: string[] }) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState('');
  const listId = useId();
  const inFile = new Set(headers.map(normName));
  const present = o.protect.filter((n) => inFile.has(normName(n)));
  const absent = o.protect.filter((n) => !inFile.has(normName(n)));
  const isDefault = sameNames(o.protect, DEFAULT_PROTECT);
  const scaled = scaledOnPurpose(o, headers);
  const byChoice = headers.filter((h) => o.columns[h]?.keep !== false && o.columns[h]?.role === 'protect' && !o.protect.some((n) => normName(n) === normName(h)));
  const suggestions = headers.filter((h) => !o.protect.some((n) => normName(n) === normName(h)));

  const add = () => {
    const names = draft.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    const bad = names.find((n) => !PROTECT_NAME_RE.test(n));
    if (bad) return setProblem(`"${bad}" is not a valid column name.`);
    const next = [...o.protect];
    for (const n of names) if (!next.some((x) => normName(x) === normName(n))) next.push(n);
    set({ protect: next });
    setDraft('');
    setProblem('');
  };
  const remove = (n: string) => set({ protect: o.protect.filter((x) => x !== n) });

  const chip = (n: string, muted: boolean) => (
    <li key={n} className={`inline-flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-1 font-mono text-[12px] ${muted ? 'border-line bg-sunken text-faint' : 'border-safe/30 bg-safe-soft text-safe'}`}>
      {n}
      <button type="button" onClick={() => remove(n)} aria-label={`Stop protecting ${n}`} title={`Stop protecting ${n}`} className="grid h-4 w-4 place-items-center rounded hover:bg-black/10">
        <Icon name="x" size={11} />
      </button>
    </li>
  );

  return (
    <Group title="Protected columns" note="level 3 and up">
      <p className="-mt-1 text-[13px] leading-snug text-muted">These columns are never changed, so scaling skips them. Add a column of your own to keep its numbers as they are.</p>
      {present.length > 0 ? <ul className="flex flex-wrap gap-1.5" aria-label="Protected columns in this data">{present.map((n) => chip(n, false))}</ul> : <p className="text-[13px] text-muted">None of the protected names is a column of this data.</p>}
      {absent.length > 0 && (
        <details className="group text-[13px]">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-muted hover:text-ink">
            <Icon name="chevron" size={12} className="transition-transform group-open:rotate-90" />
            {absent.length} more standard {absent.length === 1 ? 'name' : 'names'} not in this data
          </summary>
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Protected names not in this data">
            {absent.map((n) => chip(n, true))}
          </ul>
        </details>
      )}
      <div>
        <div className="flex gap-2">
          <input
            list={listId}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setProblem('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            aria-label="Column to protect"
            placeholder="Column name, then Enter"
            className="h-9 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-3 font-mono text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
          />
          <datalist id={listId}>
            {suggestions.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
          <Button size="md" icon="plus" onClick={add} disabled={!draft.trim()}>
            Add
          </Button>
        </div>
        {problem && (
          <p role="alert" className="mt-1.5 text-[12.5px] text-bad">
            {problem}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-faint">{o.protect.length} protected {o.protect.length === 1 ? 'name' : 'names'}</span>
        <Button size="sm" variant="ghost" icon="reset" disabled={isDefault} onClick={() => set({ protect: [...DEFAULT_PROTECT] })}>
          Reset to the standard list
        </Button>
      </div>
      <p className="text-[12.5px] leading-snug text-faint">
        A standard name such as DV stays protected by its name even when it is taken off this list. To scale one of them on purpose, choose <em>Covariate to scale</em> for it in Column settings.
      </p>
      {scaled.length > 0 && (
        <p className="rounded-lg border border-mask/30 bg-mask-soft px-3 py-2 text-[13px] leading-snug text-mask-ink">
          <strong className="font-semibold">{scaled.join(', ')}</strong> {scaled.length === 1 ? 'is' : 'are'} scaled because you chose it in Column settings, so {scaled.length === 1 ? 'it is' : 'they are'} left off the protected list that is sent. The program would otherwise skip {scaled.length === 1 ? 'it' : 'them'} without a warning.
        </p>
      )}
      {byChoice.length > 0 && <p className="text-[12.5px] leading-snug text-faint">Also protected by your choice in Column settings: {byChoice.join(', ')}.</p>}
    </Group>
  );
}

export function SettingsPanel({ o, set, headers, multi }: { o: Options; set: SetOpts; headers: string[]; multi: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface">
      <Group title="How much to mask">
        <div className="grid gap-2" role="radiogroup" aria-label="Masking level">
          {LEVELS.filter((l) => !multi || l.level <= 3).map((l) => {
            const on = o.level === l.level;
            return (
              <button
                key={l.level}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => set({ level: l.level as Level })}
                className={`flex gap-3 rounded-lg border p-3 text-left transition-colors ${on ? 'border-brand bg-sunken ring-1 ring-brand' : 'border-line hover:border-line-strong'}`}
              >
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${on ? 'bg-brand text-brand-ink' : 'bg-sunken text-muted'}`}>{l.level}</span>
                <span>
                  <span className="block text-sm font-bold leading-5">{l.name}</span>
                  <span className="block text-[13px] leading-snug text-muted">{l.text}</span>
                </span>
              </button>
            );
          })}
        </div>
        {multi && <p className="text-[13px] leading-snug text-muted">Several datasets are masked at levels 1 to 3. Level 4 re-sorts the rows, which cannot be traced through a combined dataset.</p>}
      </Group>

      <Group title="Repeatability">
        <Field label="Seed" hint="The same file, options and seed give exactly the same masked file. Change it to get a different masking.">
          <div className="flex gap-2">
            <NumberInput ariaLabel="Seed" value={o.seed} onChange={(n) => set({ seed: Math.max(0, Math.trunc(n)) })} />
            <button type="button" aria-label="Pick a random seed" title="Pick a random seed" onClick={() => set({ seed: Math.floor(Math.random() * 1_000_000) })} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-strong text-muted hover:text-ink">
              <Icon name="shuffle" />
            </button>
          </div>
        </Field>
        <Field label="Code style for IDs">
          <Segmented<IdStyle>
            label="ID style"
            value={o.idStyle}
            onChange={(v) => set({ idStyle: v })}
            options={[
              { value: 'sequential', label: '1, 2, 3', hint: 'Numbers in order of appearance' },
              { value: 'padded', label: '0001', hint: 'Zero-padded numbers' },
              { value: 'hashed', label: 'Hashed', hint: 'Random-looking codes' },
            ]}
          />
        </Field>
      </Group>

      {o.level >= 2 && (
        <Group title="Dates" note="level 2 and up">
          <Segmented
            label="Date shift"
            value={o.dateShiftMode}
            onChange={(v) => set({ dateShiftMode: v })}
            options={[
              { value: 'random', label: 'Random shift' },
              { value: 'fixed', label: 'Fixed shift' },
            ]}
          />
          {o.dateShiftMode === 'random' ? (
            <Field label="Draw the shift between" hint={multi ? 'One whole number of days is added to every date in every dataset. Intervals between dates stay the same.' : 'One decimal number of days, like 23.6, is added to every date. Intervals between dates stay the same.'}>
              <div className="flex items-center gap-2">
                <NumberInput ariaLabel="Minimum days" value={o.dateShiftMin} onChange={(n) => set({ dateShiftMin: n })} />
                <span className="text-sm text-muted">and</span>
                <NumberInput ariaLabel="Maximum days" value={o.dateShiftMax} onChange={(n) => set({ dateShiftMax: n })} />
                <span className="text-sm text-muted">days</span>
              </div>
            </Field>
          ) : (
            <Field label="Shift every date by" hint={multi ? 'Use a whole number: date-only and date-time columns then move by exactly the same amount. Negative numbers move dates earlier.' : 'Negative numbers move dates earlier. The exact value is written to keymap.txt.'}>
              <div className="flex items-center gap-2">
                <NumberInput ariaLabel="Days" value={o.dateShiftFixed} onChange={(n) => set({ dateShiftFixed: n })} />
                <span className="text-sm text-muted">days</span>
              </div>
            </Field>
          )}
        </Group>
      )}

      {o.level >= 3 && (
        <Group title="Covariate scaling" note="level 3 and up">
          <Field label="Hidden factor between" hint={multi ? 'Each scaled column name gets one random factor in this range, the same in every dataset. Every factor is recorded in keymap2.txt.' : 'Each scaled column is multiplied or divided by one random factor in this range. Every factor is recorded in keymap.txt.'}>
            <div className="flex items-center gap-2">
              <NumberInput ariaLabel="Minimum factor" value={o.scaleMin} onChange={(n) => set({ scaleMin: n })} />
              <span className="text-sm text-muted">and</span>
              <NumberInput ariaLabel="Maximum factor" value={o.scaleMax} onChange={(n) => set({ scaleMax: n })} />
            </div>
          </Field>
        </Group>
      )}

      {o.level >= 3 && <ProtectEditor o={o} set={set} headers={headers} />}

      {multi && (
        <Group title="Several datasets">
          <Toggle checked={o.adamHints} onChange={(v) => set({ adamHints: v })} label="Recognise ADaM column names" hint="Columns ending in DT, DTM or DTC are dates, TRT… columns are treatments, INVID and INVNAM are users." />
        </Group>
      )}

      {!multi && <Group title="Column names">
        <Segmented<RenameMode>
          label="Column renaming"
          value={o.renameMode}
          onChange={(v) => set({ renameMode: v })}
          options={[
            { value: 'off', label: 'Keep names' },
            { value: 'selected', label: 'Rename chosen' },
            { value: 'except', label: 'Rename all but' },
          ]}
        />
        {o.renameMode !== 'off' && (
          <>
            <p className="text-[13px] leading-snug text-muted">
              {o.renameMode === 'selected' ? 'Tick the columns to rename in the column list. Leave a new name empty for an automatic one.' : 'Tick the columns whose names stay as they are in the column list. All others are renamed.'}
            </p>
            <Field label="Prefix for automatic names" hint={`Gives ${o.renamePrefix || 'COL'}01, ${o.renamePrefix || 'COL'}02 and so on.`}>
              <TextInput ariaLabel="Rename prefix" value={o.renamePrefix} onChange={(v) => set({ renamePrefix: v.replace(/\s/g, '') })} />
            </Field>
          </>
        )}
      </Group>}

      <Group title="Files to write">
        <Toggle checked={o.writeKeymap} onChange={(v) => set({ writeKeymap: v })} label={multi ? 'Write keymap2.txt' : 'Write keymap.txt'} hint="The key that turns the masked data back into the original. Keep it offline." />
        {o.level < 4 && <Toggle checked={o.dropFreetext} onChange={(v) => set({ dropFreetext: v })} label="Remove free-text columns" hint="Instead of replacing each text with a dot." />}
        {!multi && (
          <Field label="Name of the masked file" hint="Leave empty for obfuscated.csv.">
            <TextInput ariaLabel="Output file name" value={o.outputName} onChange={(v) => set({ outputName: v.replace(/[^A-Za-z0-9._-]/g, '') })} placeholder="obfuscated.csv" />
          </Field>
        )}
      </Group>

      <details className="group px-5 py-4">
        <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-bold">
          Reading the file
          <Icon name="chevron" size={14} className="text-faint transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-4 space-y-4">
          <Field label="Delimiter">
            <Segmented
              label="Delimiter"
              value={o.delimiter}
              onChange={(v) => set({ delimiter: v })}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'comma', label: ',' },
                { value: 'tab', label: 'Tab' },
                { value: 'semicolon', label: ';' },
                { value: 'space', label: 'Space' },
              ]}
            />
          </Field>
          {!multi && <Toggle checked={o.noHeader} onChange={(v) => set({ noHeader: v })} label="The first row is data, not names" hint="Columns are then called COL1, COL2 and so on." />}
          <Field label="Comment characters" hint="Lines starting with one of these are skipped.">
            <TextInput ariaLabel="Comment characters" value={o.commentChars} onChange={(v) => set({ commentChars: v })} />
          </Field>
          <Toggle checked={o.verbose} onChange={(v) => set({ verbose: v })} label="Detailed log" hint={multi ? 'Adds debug lines to the run console and to run2.log.' : 'Adds debug lines to the run console and to obfuscator.log.'} />
        </div>
      </details>
    </div>
  );
}
