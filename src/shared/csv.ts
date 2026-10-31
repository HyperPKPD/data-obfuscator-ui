import type { ParsedTable } from './types';

const COMMENT_DEFAULT = '#;$';

export function detectDelimiter(sample: string): ParsedTable['delimiter'] {
  const first = sample.split(/\r?\n/).find((l) => l.trim() && !COMMENT_DEFAULT.includes(l.trim()[0])) ?? '';
  if (first.includes('\t')) return 'tab';
  if (first.includes(',')) return 'comma';
  if (first.includes(';')) return 'semicolon';
  return 'space';
}

export const DELIM_CHAR: Record<ParsedTable['delimiter'], string> = {
  comma: ',',
  tab: '\t',
  semicolon: ';',
  space: ' ',
};

/** Split one line into fields (handles "quoted, fields" and "" escapes). */
export function splitLine(line: string, delim: ParsedTable['delimiter']): string[] {
  if (delim === 'space') return line.trim().split(/\s+/);
  const d = DELIM_CHAR[delim];
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === d) {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function quoteField(v: string, delim: ParsedTable['delimiter']): string {
  const d = DELIM_CHAR[delim];
  return v.includes(d) || v.includes('"') || /[\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export interface ParseOptions {
  delimiter?: ParsedTable['delimiter'] | 'auto';
  noHeader?: boolean;
  commentChars?: string;
  /** Stop after this many data rows (the total is still counted). */
  maxRows?: number;
}

export function parseDelimited(text: string, o: ParseOptions = {}): ParsedTable {
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delimiter = !o.delimiter || o.delimiter === 'auto' ? detectDelimiter(clean.slice(0, 4000)) : o.delimiter;
  const comments = o.commentChars ?? COMMENT_DEFAULT;
  const max = o.maxRows ?? Infinity;
  const lines = clean.split(/\r?\n/);
  let headers: string[] | null = null;
  const rows: string[][] = [];
  let total = 0;
  for (const raw of lines) {
    if (!raw.trim()) continue;
    if (comments.includes(raw.trim()[0])) continue;
    if (!headers && !o.noHeader) {
      headers = splitLine(raw, delimiter).map((h) => h.trim());
      continue;
    }
    total++;
    if (rows.length < max) rows.push(splitLine(raw, delimiter));
  }
  if (!headers) {
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    headers = Array.from({ length: width }, (_, i) => `COL${i + 1}`);
  }
  return { headers, rows, delimiter, totalRows: total, hadHeader: !o.noHeader };
}

export function serialize(headers: string[], rows: string[][], delim: ParsedTable['delimiter']): string {
  const d = delim === 'space' ? ' ' : DELIM_CHAR[delim];
  const line = (r: string[]) => (delim === 'space' ? r.join(d) : r.map((v) => quoteField(v, delim)).join(d));
  return [line(headers), ...rows.map(line)].join('\n') + '\n';
}
