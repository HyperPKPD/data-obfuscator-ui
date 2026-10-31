import { strToU8, zipSync } from 'fflate';
import type { ResultFile } from '../shared/types';

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function downloadText(name: string, text: string) {
  save(new Blob([text], { type: 'text/plain;charset=utf-8' }), name);
}

export function downloadZip(files: ResultFile[], zipName: string) {
  const data: Record<string, Uint8Array> = {};
  for (const f of files) if (f.text !== undefined) data[f.name] = strToU8(f.text);
  save(new Blob([zipSync(data, { level: 6 }) as BlobPart], { type: 'application/zip' }), zipName);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export { samples as SAMPLES } from '../../app.config';
