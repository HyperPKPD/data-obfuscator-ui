import { useRef, useState } from 'react';
import { landing, samples as SAMPLES, ui, type Sample } from '../../app.config';
import type { EngineInfo } from '../shared/types';
import { Icon } from './ui';

export function Dropzone({ onFiles, onSample, engine, useReal, error }: { onFiles: (f: File[]) => void; onSample: (s: Sample) => void; engine: EngineInfo | null; useReal: boolean; error: string }) {
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const real = engine?.kind === 'real' && useReal;
  return (
    <div className="mx-auto grid max-w-[1600px] gap-8 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:pt-16">
      <div className="max-w-xl">
        <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight sm:text-[42px]">{landing.headline}</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted">{landing.intro}</p>
        <ul className="mt-6 space-y-2.5 text-[15px]">
          {landing.points.map((p) => (
            <li key={p.text} className="flex gap-3">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${p.tone === 'mask' ? 'bg-mask' : 'bg-safe'}`} />
              <span>{p.text}</span>
            </li>
          ))}
          <li className="flex gap-3">
            <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-faint" />
            <span>{engine === null ? landing.engineNote.checking : real ? landing.engineNote.real : landing.engineNote.simulation}</span>
          </li>
        </ul>
      </div>

      <div>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const dropped = [...(e.dataTransfer.files ?? [])];
            if (dropped.length) onFiles(dropped);
          }}
          className={`flex min-h-[250px] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${over ? 'border-mask bg-mask-soft' : 'border-line-strong bg-surface'}`}
        >
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-sunken text-ink">
            <Icon name="upload" size={22} />
          </div>
          <p className="mt-4 text-lg font-bold">{landing.dropTitle}</p>
          <p className="mt-1 max-w-md text-sm text-muted">
            CSV, TSV, semicolon or space-delimited text, up to {engine?.maxUploadMb ?? ui.simulationMaxMb} MB each. Drop several related datasets (for example ADaM) to mask them together.
          </p>
          <button type="button" onClick={() => input.current?.click()} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-5 text-sm font-semibold text-brand-ink hover:opacity-90">
            <Icon name="file" size={16} />
            Choose files
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept=".csv,.tsv,.txt,.dat,.prn,text/*"
            className="sr-only"
            aria-label="Choose dataset files"
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              if (picked.length) onFiles(picked);
              e.target.value = '';
            }}
          />
          {error && (
            <p role="alert" className="mt-4 rounded-md bg-bad-soft px-3 py-2 text-sm font-medium text-bad">
              {error}
            </p>
          )}
        </div>

        <h2 className="mb-2 mt-7 text-sm font-bold">{landing.samplesHeading}</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {SAMPLES.map((s) => (
            <button key={s.file} type="button" onClick={() => onSample(s)} className="group rounded-xl border border-line bg-surface p-3.5 text-left transition-colors hover:border-line-strong hover:bg-sunken">
              <span className="flex items-center justify-between gap-2 text-[15px] font-semibold">
                {s.title}
                <Icon name="chevron" size={14} className="text-faint transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted">{s.note}</span>
              {s.files ? (
                <span className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-mask-ink">
                  <Icon name="layers" size={13} />
                  {s.files.length} files, masked together
                </span>
              ) : (
                <span className="mt-1.5 block font-mono text-[11.5px] text-faint">{s.file}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
