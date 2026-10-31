import { useMemo, useState } from 'react';
import { commandLine, configText } from '../shared/options';
import type { Options } from '../shared/types';
import { CopyButton, Icon, Segmented } from './ui';

export function CommandPreview({ o, headers, fileNames }: { o: Options; headers: string[]; fileNames: string[] }) {
  const [view, setView] = useState<'command' | 'config'>('command');
  const text = useMemo(() => (view === 'command' ? commandLine(o, headers, fileNames) : configText(o, headers, fileNames)), [view, o, headers, fileNames]);
  return (
    <details className="group rounded-xl border border-line bg-surface">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-bold">
        <span className="flex items-center gap-2">
          <Icon name="terminal" />
          The same run on the command line
        </span>
        <Icon name="chevron" size={14} className="text-faint transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-line p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Segmented
            label="Format"
            value={view}
            onChange={setView}
            options={[
              { value: 'command', label: 'Command' },
              { value: 'config', label: 'Options file' },
            ]}
          />
          <CopyButton text={text} />
        </div>
        <pre className="scroll-thin overflow-auto rounded-lg bg-console p-3.5 font-mono text-[12.5px] leading-relaxed text-console-ink">{text}</pre>
        <p className="mt-2 text-[13px] text-muted">{view === 'command' ? `Run this next to your ${fileNames.length > 1 ? 'files' : 'file'} to get the same masked data without this app.` : `Save as options.txt and run: data-obfuscator ${fileNames.length > 1 ? 'run2' : 'run'} --config options.txt`}</p>
      </div>
    </details>
  );
}
