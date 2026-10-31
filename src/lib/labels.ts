import { levels as levelsConfig } from '../../app.config';
import type { Role } from '../shared/detect';
import type { Level, RoleChoice } from '../shared/types';

export const LEVELS: { level: Level; name: string; text: string }[] = levelsConfig.map((l) => ({ ...l }));

export const ROLE_CHOICES: { value: RoleChoice; label: string }[] = [
  { value: 'auto', label: 'Detect from name' },
  { value: 'id', label: 'ID (NONMEM subject)' },
  { value: 'subject', label: 'Subject identifier' },
  { value: 'study', label: 'Study' },
  { value: 'site', label: 'Site' },
  { value: 'user', label: 'User or investigator' },
  { value: 'treatment', label: 'Treatment or arm' },
  { value: 'date', label: 'Date' },
  { value: 'freetext', label: 'Free text' },
  { value: 'covariate', label: 'Covariate to scale' },
  { value: 'sensitive', label: 'Other identifier' },
  { value: 'protect', label: 'Never change' },
];

/** Which "Treat as" choices do something at a masking level. Level 1 recodes identifiers only, level 2 adds labels, dates and text, level 3 adds scaled numbers. */
const MIN_LEVEL: Record<RoleChoice, Level> = {
  auto: 1,
  id: 1,
  subject: 1,
  study: 1,
  site: 1,
  user: 1,
  sensitive: 1,
  protect: 1,
  treatment: 2,
  date: 2,
  freetext: 2,
  covariate: 3,
};

/**
 * The "Treat as" choices to offer at this level: only the ones that change something. The column's current
 * choice stays in the list (marked) even when the level makes it moot, so the list never silently shows a wrong value.
 */
export function roleChoicesFor(level: Level, current: RoleChoice): { value: RoleChoice; label: string }[] {
  return ROLE_CHOICES.filter((r) => MIN_LEVEL[r.value] <= level || r.value === current).map((r) =>
    MIN_LEVEL[r.value] > level ? { ...r, label: `${r.label} (no effect at level ${level})` } : r,
  );
}

export const ROLE_NAME: Record<Role, string> = {
  id: 'ID',
  subject: 'subject',
  study: 'study',
  site: 'site',
  user: 'user',
  treatment: 'treatment',
  sex: 'sex',
  race: 'race',
  country: 'country',
  date: 'date',
  freetext: 'free text',
  covariate: 'covariate',
  protected: 'protected',
  other: '',
};
