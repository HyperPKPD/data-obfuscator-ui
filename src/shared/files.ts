// File names of uploads. The browser and the server use the same function, so the browser knows
// which name the server gave each file and can match every masked output (`<name>_masked.csv`) to its source.

/** A safe, unique name for an uploaded file. `taken` collects the names already used (lower case). */
export function safeUploadName(original: string, taken: Set<string>): string {
  let base = (original.split(/[\\/]/).pop() ?? '').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '');
  if (!base) base = 'dataset.csv';
  base = base.slice(-100);
  const dot = base.lastIndexOf('.');
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : '';
  let name = base;
  let k = 2;
  while (taken.has(name.toLowerCase())) name = `${stem}_${k++}${ext}`;
  taken.add(name.toLowerCase());
  return name;
}

export const stemOf = (name: string): string => name.replace(/\.[^.]*$/, '');

/** Names the server gives to a list of uploads, in order. */
export function uploadNames(originals: string[]): string[] {
  const taken = new Set<string>();
  return originals.map((n) => safeUploadName(n, taken));
}

/** The masked file `run2` writes for an upload (extension is csv, tsv or dat depending on the delimiter). */
export function maskedMatch(outputName: string, uploadName: string): boolean {
  const stem = stemOf(uploadName);
  return new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}_masked(_\\d+)?\\.(csv|tsv|dat)$`, 'i').test(outputName);
}
