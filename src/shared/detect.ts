// Name-based column role detection. Mirrors the rules of the Rust program (see CONFIGS.md, 6.2)
// so the preview can show what a real run will do with each column.

import type { Level } from './types';

export type Role =
  | 'id'
  | 'subject'
  | 'study'
  | 'site'
  | 'user'
  | 'treatment'
  | 'sex'
  | 'race'
  | 'country'
  | 'date'
  | 'freetext'
  | 'covariate'
  | 'protected'
  | 'other';

const NAMES: Record<Exclude<Role, 'other'>, string[]> = {
  id: ['ID', 'I', 'NMID'],
  subject: ['USUBJID', 'SUBJID', 'SUBJECT', 'PATIENT', 'PTID', 'PID', 'SUBJ'],
  study: ['STUDY', 'STU', 'STUDYID', 'STUDYN', 'PROTO', 'PROTOCOL', 'STUDYNUM', 'TRIAL'],
  site: ['SITE', 'SITEID', 'CENTER', 'CENTRE', 'CENTERNO', 'SITEIDN'],
  user: ['USERID', 'USER', 'INVESTIGATOR', 'INV', 'CRA', 'OPERATOR', 'ANALYST'],
  treatment: ['ARM', 'TRT', 'TREAT', 'TREATMENT', 'GROUP', 'COHORT', 'TRTGRP', 'TRTA', 'TRTP', 'ARMCD', 'ACTARM', 'DOSEGRP'],
  sex: ['SEX', 'GENDER', 'SEXN'],
  race: ['RACE', 'ETHNIC', 'ETHNICITY', 'RACEN'],
  country: ['COUNTRY', 'COUNTRYN', 'NAT'],
  date: ['DATE', 'DATETIME', 'DOB', 'BIRTH', 'BRTHDAT', 'RFSTDTC', 'RFENDTC', 'VISITDT'],
  freetext: ['COMMENT', 'COMMENTS', 'NOTE', 'NOTES', 'TEXT', 'EMAIL', 'PHONE', 'NAME', 'INITIALS', 'INIT', 'SUBJINIT', 'ADDRESS', 'FREE'],
  covariate: ['WT', 'WGT', 'WEIGHT', 'AGE', 'HT', 'HEIGHT', 'BMI', 'CRCL', 'EGFR', 'SCR', 'ALT', 'AST', 'BILI', 'ALB', 'BSA', 'LBWT'],
  protected: ['TIME', 'TAD', 'DV', 'LNDV', 'AMT', 'RATE', 'EVID', 'MDV', 'CMT', 'ADDL', 'II', 'SS', 'DVID', 'CENS', 'LIMIT', 'BLQ', 'L2', 'OCC', 'PC', 'PCYC'],
};

export const DEFAULT_PROTECT = NAMES.protected;

const INDEX = new Map<string, Role>();
for (const [role, names] of Object.entries(NAMES) as [Role, string[]][]) {
  for (const n of names) INDEX.set(n, role);
}

export function normName(name: string): string {
  return name.trim().toUpperCase().replace(/[\s-]+/g, '_');
}

export function detectRole(name: string): Role {
  const n = normName(name);
  const hit = INDEX.get(n);
  if (hit) return hit;
  if (n.endsWith('DTC') || n.endsWith('_DT')) return 'date';
  return 'other';
}

/**
 * CDISC ADaM / SDTM names that `run2` recognises on top of the normal detection (adam_hints):
 * --DT --DTM --DTC columns are dates, TRT.. columns are treatments, INVID / INVNAM are users.
 * Only used for columns the normal detection leaves as `other`.
 */
export function adamRole(name: string): Role {
  const n = name.trim().toUpperCase();
  if (['DT', 'DTM', 'DTC', 'DTTM', 'DTMC', 'DTS'].some((s) => n.endsWith(s) && n.length > s.length)) return 'date';
  if (n.startsWith('TRT') && !n.endsWith('DY') && !n.endsWith('DUR')) return 'treatment';
  if (n === 'INVID' || n === 'INVNAM') return 'user';
  return 'other';
}

export type ActionKind = 'recode' | 'shift' | 'redact' | 'drop' | 'scale' | 'protect' | 'pass';

export interface Action {
  kind: ActionKind;
  /** Short plain-language description for the column table. */
  text: string;
}

export function actionFor(role: Role, level: Level): Action {
  switch (role) {
    case 'id':
    case 'subject':
    case 'study':
    case 'site':
    case 'user':
      return { kind: 'recode', text: 'Replaced by a code' };
    case 'treatment':
    case 'sex':
    case 'race':
    case 'country':
      return level >= 2 ? { kind: 'recode', text: 'Replaced by a code' } : { kind: 'pass', text: 'Unchanged at level 1' };
    case 'date':
      return level >= 2 ? { kind: 'shift', text: 'Shifted by one offset' } : { kind: 'pass', text: 'Unchanged at level 1' };
    case 'freetext':
      if (level >= 4) return { kind: 'drop', text: 'Dropped at level 4' };
      return level >= 2 ? { kind: 'redact', text: 'Replaced by .' } : { kind: 'pass', text: 'Unchanged at level 1' };
    case 'covariate':
      return level >= 3 ? { kind: 'scale', text: 'Multiplied or divided by a hidden factor' } : { kind: 'pass', text: 'Unchanged below level 3' };
    case 'protected':
      return { kind: 'protect', text: 'Never changed' };
    default:
      return { kind: 'pass', text: 'Passed through unchanged' };
  }
}

export function looksLikeNumber(v: string): boolean {
  const t = v.trim();
  return t !== '' && t !== '.' && Number.isFinite(Number(t));
}

/** Rough guess whether an unrecognised column holds text that could identify something. */
export function looksLikeText(values: string[]): boolean {
  let text = 0;
  let seen = 0;
  for (const raw of values) {
    const v = raw.trim();
    if (!v || v === '.') continue;
    seen++;
    if (looksLikeNumber(v)) continue;
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) continue; // clock time
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) continue; // date
    text++;
  }
  return seen > 0 && text / seen > 0.5;
}
