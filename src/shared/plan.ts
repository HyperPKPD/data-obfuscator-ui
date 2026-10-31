import { DEFAULT_PROTECT, adamRole, detectRole, normName, type Role } from './detect';
import type { Options, RoleChoice } from './types';

export interface ColumnPlan {
  name: string;
  index: number;
  /** What the column is treated as in this run. */
  role: Role;
  /** Role the user picked (`auto` = by name). */
  userRole: RoleChoice;
  /** false = dropped because the user unticked it. */
  keep: boolean;
}

/** True when two lists hold the same names (ignoring case and order). */
export function sameNames(a: string[], b: string[]): boolean {
  const x = new Set(a.map(normName));
  const y = new Set(b.map(normName));
  return x.size === y.size && [...x].every((n) => y.has(n));
}

/**
 * The list of protected columns that is really sent to the program.
 *
 * - Below level 3 the program's own list is used (the editable list only matters when numbers are scaled).
 * - Columns the user set to "Never change" are added.
 * - Columns the user set to "Covariate to scale" are taken out. The program silently skips a column that
 *   is on its protect list, so without this a column such as DV could never be scaled.
 */
export function effectiveProtect(o: Options, headers: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (n: string) => {
    const k = normName(n);
    if (n.trim() && !seen.has(k)) {
      seen.add(k);
      out.push(n.trim());
    }
  };
  (o.level >= 3 ? o.protect : DEFAULT_PROTECT).forEach(add);
  const kept = headers.filter((h) => o.columns[h]?.keep !== false);
  for (const h of kept) if (o.columns[h]?.role === 'protect') add(h);
  const scaled = new Set(kept.filter((h) => o.columns[h]?.role === 'covariate').map(normName));
  return out.filter((n) => !scaled.has(normName(n)));
}

/** Columns that are on the protect list but that the user asked to scale, so they are taken off it. */
export function scaledOnPurpose(o: Options, headers: string[]): string[] {
  const base = new Set([...(o.level >= 3 ? o.protect : DEFAULT_PROTECT), ...DEFAULT_PROTECT].map(normName));
  return headers.filter((h) => o.columns[h]?.keep !== false && o.columns[h]?.role === 'covariate' && base.has(normName(h)));
}

/** Work out what every column is, from the user's choices and the column names. `multi` = several datasets (run2). */
export function planColumns(headers: string[], o: Options, multi = false): ColumnPlan[] {
  const protectSet = new Set(effectiveProtect(o, headers).map(normName));
  return headers.map((name, index) => {
    const c = o.columns[name];
    const userRole: RoleChoice = c?.role ?? 'auto';
    let role: Role;
    switch (userRole) {
      case 'auto': {
        if (protectSet.has(normName(name))) {
          role = 'protected';
          break;
        }
        const found = detectRole(name);
        // the program still protects its standard names when they are taken off the list
        role = found === 'other' && multi && o.adamHints ? adamRole(name) : found;
        break;
      }
      case 'protect':
        role = 'protected';
        break;
      case 'sensitive':
        role = 'other';
        break;
      default:
        role = userRole;
    }
    return { name, index, role, userRole, keep: c?.keep !== false };
  });
}

/** True when the column is removed from the output at this level. */
export function isDropped(p: ColumnPlan, o: Options): boolean {
  if (!p.keep) return true;
  return p.role === 'freetext' && (o.level >= 4 || o.dropFreetext);
}

export type Effect = 'recode' | 'shift' | 'redact' | 'scale' | 'protect' | 'drop' | 'pass';

export function effectOf(p: ColumnPlan, o: Options): { kind: Effect; text: string } {
  if (!p.keep) return { kind: 'drop', text: 'Removed (unticked)' };
  if (isDropped(p, o)) return { kind: 'drop', text: o.level >= 4 ? 'Removed at level 4' : 'Removed (free text)' };
  if (p.userRole === 'sensitive') return { kind: 'recode', text: 'Replaced by codes' };
  switch (p.role) {
    case 'id':
    case 'subject':
    case 'study':
    case 'site':
    case 'user':
      return { kind: 'recode', text: 'Replaced by codes' };
    case 'treatment':
    case 'sex':
    case 'race':
    case 'country':
      return o.level >= 2 ? { kind: 'recode', text: 'Replaced by codes' } : { kind: 'pass', text: 'Unchanged at level 1' };
    case 'date':
      return o.level >= 2 ? { kind: 'shift', text: 'Dates moved by one offset' } : { kind: 'pass', text: 'Unchanged at level 1' };
    case 'freetext':
      return o.level >= 2 ? { kind: 'redact', text: 'Text replaced by .' } : { kind: 'pass', text: 'Unchanged at level 1' };
    case 'covariate':
      return o.level >= 3 ? { kind: 'scale', text: 'Multiplied or divided by a hidden factor' } : { kind: 'pass', text: 'Unchanged below level 3' };
    case 'protected':
      return { kind: 'protect', text: 'Never changed' };
    default:
      return { kind: 'pass', text: 'Passed through' };
  }
}

/** How many columns a run changes, protects or removes (for the badges and tab labels). */
export function effectCounts(plans: ColumnPlan[], o: Options): { change: number; protect: number; drop: number } {
  const c = { change: 0, protect: 0, drop: 0 };
  for (const p of plans) {
    const k = effectOf(p, o).kind;
    if (k === 'protect') c.protect++;
    else if (k === 'drop') c.drop++;
    else if (k !== 'pass') c.change++;
  }
  return c;
}
