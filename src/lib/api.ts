import { ui } from '../../app.config';
import type { EngineInfo, Options, ResultFile, RunEvent } from '../shared/types';

const SIM_INFO: EngineInfo = {
  kind: 'simulation',
  version: '',
  detail: 'No server with the real program was found, so runs are simulated in this browser.',
  maxUploadMb: ui.simulationMaxMb,
};

/** Ask the server which engine it has. Any failure means "simulation only". */
export async function fetchEngine(): Promise<EngineInfo> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ui.healthTimeoutMs);
    const res = await fetch('api/health', { signal: ctl.signal, headers: { Accept: 'application/json' } });
    clearTimeout(t);
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return SIM_INFO;
    const data = (await res.json()) as { engine?: EngineInfo };
    return data.engine ?? SIM_INFO;
  } catch {
    return SIM_INFO;
  }
}

export interface RealRun {
  jobId: string;
}

/**
 * Upload the file (or several files, which the server masks together with `run2`), follow the live event stream, then fetch every output file.
 * `onEvent` receives log/step events as they arrive and a final `done` or `fail`.
 */
export async function runOnServer(
  files: File[],
  options: Options,
  onEvent: (e: RunEvent) => void,
  onJob: (id: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const form = new FormData();
  form.append('options', JSON.stringify(options));
  for (const f of files) form.append('file', f, f.name);
  let id: string;
  try {
    const res = await fetch('api/jobs', { method: 'POST', body: form, signal });
    const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !body.id) {
      onEvent({ type: 'fail', message: body.error ?? `The server refused the run (${res.status}).` });
      return;
    }
    id = body.id;
  } catch (e) {
    if (signal.aborted) return;
    onEvent({ type: 'fail', message: 'Could not reach the server. ' + (e instanceof Error ? e.message : '') });
    return;
  }
  onJob(id);

  await new Promise<void>((resolve) => {
    const es = new EventSource(`api/jobs/${id}/events`);
    let finished = false;
    const stop = () => {
      finished = true;
      es.close();
      resolve();
    };
    signal.addEventListener('abort', stop, { once: true });
    es.onmessage = async (m) => {
      const e = JSON.parse(m.data) as RunEvent;
      if (e.type === 'done') {
        const files = await Promise.all(
          e.files.map(async (f): Promise<ResultFile> => {
            try {
              const r = await fetch(`api/jobs/${id}/files/${encodeURIComponent(f.name)}`, { signal });
              return { ...f, text: await r.text() };
            } catch {
              return f;
            }
          }),
        );
        onEvent({ ...e, files });
        stop();
      } else if (e.type === 'fail') {
        onEvent(e);
        stop();
      } else {
        onEvent(e);
      }
    };
    es.onerror = () => {
      if (finished) return;
      if (es.readyState === EventSource.CLOSED) {
        onEvent({ type: 'fail', message: 'The connection to the server was lost.' });
        stop();
      }
    };
  });
}

export function deleteJob(id: string) {
  void fetch(`api/jobs/${id}`, { method: 'DELETE', keepalive: true }).catch(() => undefined);
}
