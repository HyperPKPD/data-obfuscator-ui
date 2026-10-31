import { adamRole, detectRole } from '../shared/detect';
import { effectOf, planColumns } from '../shared/plan';
import { ROLE_NAME, roleChoicesFor } from '../lib/labels';
import type { ColumnSetting, Options, RoleChoice } from '../shared/types';
import { Badge, Checkbox, Select, TextInput } from './ui';

const TONE = { recode: 'mask', shift: 'mask', redact: 'mask', scale: 'mask', protect: 'safe', drop: 'bad', pass: 'neutral' } as const;

export function ColumnTable({
  headers,
  firstValue,
  where,
  datasetNames,
  o,
  setColumn,
  setAllKeep,
}: {
  headers: string[];
  /** First non-empty value of each column, from the first dataset that has it. */
  firstValue: Record<string, string>;
  /** Several datasets only: which datasets (indexes into `datasetNames`) hold each column. */
  where?: Record<string, number[]>;
  datasetNames: string[];
  o: Options;
  setColumn: (name: string, patch: Partial<ColumnSetting>) => void;
  setAllKeep: (keep: boolean) => void;
}) {
  const multi = datasetNames.length > 1;
  const plans = planColumns(headers, o, multi);
  const sample = (name: string) => firstValue[name] ?? '';
  const renameHeading = multi ? '' : o.renameMode === 'selected' ? 'Rename' : o.renameMode === 'except' ? 'Keep name' : '';
  const keptCount = plans.filter((p) => p.keep).length;

  return (
    <div className="overflow-hidden rounded-lg border border-line-strong bg-surface">
      <div className="scroll-thin max-h-[520px] overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="sticky top-0 z-10 bg-grid-head text-[12.5px] text-muted">
            <tr>
              <th className="w-12 px-3 py-2 font-semibold">
                <Checkbox label="Keep every column" checked={keptCount === headers.length} onChange={setAllKeep} />
              </th>
              <th className="px-2 py-2 font-semibold">Column</th>
              {multi && <th className="px-2 py-2 font-semibold">In</th>}
              <th className="px-2 py-2 font-semibold">First value</th>
              <th className="px-2 py-2 font-semibold">Treat as</th>
              <th className="px-2 py-2 font-semibold">What happens</th>
              {renameHeading && <th className="px-2 py-2 font-semibold">{renameHeading}</th>}
            </tr>
          </thead>
          <tbody>
            {plans.map((p, j) => {
              const c = o.columns[p.name];
              const fx = effectOf(p, o);
              let detected = detectRole(p.name);
              if (detected === 'other' && multi && o.adamHints) detected = adamRole(p.name);
              const roleOptions = roleChoicesFor(o.level, c?.role ?? 'auto').map((r) =>
                r.value === 'auto' ? { value: r.value, label: detected === 'other' ? 'Detect from name (none)' : `Detect from name (${ROLE_NAME[detected]})` } : r,
              );
              const inSets = where?.[p.name] ?? [];
              return (
                <tr key={p.name + j} className={`border-t border-line ${p.keep ? '' : 'bg-sunken text-faint'}`}>
                  <td className="px-3 py-1.5">
                    <Checkbox label={`Keep ${p.name}`} checked={p.keep} onChange={(v) => setColumn(p.name, { keep: v })} />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-[13px] font-semibold">{p.name}</td>
                  {multi && (
                    <td className="max-w-[150px] truncate px-2 py-1.5 text-[12.5px] text-muted" title={inSets.map((i) => datasetNames[i]).join(', ')}>
                      {inSets.length === datasetNames.length ? 'all' : inSets.map((i) => datasetNames[i].replace(/\.[^.]*$/, '')).join(', ')}
                    </td>
                  )}
                  <td className="max-w-[160px] truncate px-2 py-1.5 font-mono text-[12.5px] text-muted" title={sample(p.name)}>
                    {sample(p.name) || <span className="text-faint">(empty)</span>}
                  </td>
                  <td className="px-2 py-1.5">
                    <Select<RoleChoice> ariaLabel={`Treat ${p.name} as`} value={c?.role ?? 'auto'} onChange={(v) => setColumn(p.name, { role: v })} options={roleOptions} className="w-full max-w-[240px]" />
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge tone={TONE[fx.kind]}>{fx.text}</Badge>
                  </td>
                  {renameHeading && (
                    <td className="px-2 py-1.5">
                      {p.keep && (
                        <div className="flex items-center gap-2">
                          <Checkbox label={`${renameHeading} ${p.name}`} checked={c?.renameFlag === true} onChange={(v) => setColumn(p.name, { renameFlag: v })} />
                          {o.renameMode === 'selected' && c?.renameFlag && <TextInput ariaLabel={`New name for ${p.name}`} value={c.newName} onChange={(v) => setColumn(p.name, { newName: v.replace(/[\s,;|"'=]/g, '') })} placeholder="automatic" className="!h-8 max-w-[150px]" />}
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
