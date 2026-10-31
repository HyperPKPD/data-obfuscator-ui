import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { createReadStream, existsSync, mkdirSync, openSync, readSync, closeSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseDelimited } from '../src/shared/csv.ts';
import { safeUploadName } from '../src/shared/files.ts';
import { normalizeOptions } from '../src/shared/options.ts';
import type { EngineInfo } from '../src/shared/types.ts';
import { config, findBinary, hasDist } from './config.ts';
import { FILE_NAME_RE, JOB_ID_RE, createJob, getJob, removeJob, runningCount, startJob, sweep } from './jobs.ts';

const binary = findBinary();

// The jobs folder must be writable by the account that runs the server. Check it now, so a wrong
// setting shows up in the start-up log (and as a clear message in the page) instead of crashing a request.
function checkJobsDir(): string | null {
  try {
    mkdirSync(config.jobsDir, { recursive: true });
    const probe = path.join(config.jobsDir, `.write-test-${process.pid}`);
    writeFileSync(probe, 'ok');
    rmSync(probe, { force: true });
    return null;
  } catch (e) {
    return `${(e as NodeJS.ErrnoException).code ?? 'error'}: ${(e as Error).message}`;
  }
}
const jobsDirProblem = checkJobsDir();
if (jobsDirProblem) console.error(`\nERROR  Cannot write to the jobs folder ${config.jobsDir}\n       ${jobsDirProblem}\n       Runs will be refused until this is fixed. Under systemd the folder must be /var/lib/data-obfuscator-app/jobs: remove any JOBS_DIR line from .env.\n`);
sweep();
setInterval(sweep, config.cleanupEveryMinutes * 60_000).unref();

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', 1);

// ---- security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  if (config.production) {
    res.setHeader('Content-Security-Policy', config.contentSecurityPolicy);
  }
  next();
});

// ---- optional CORS (only if a separate site calls this API)
app.use('/api', (req, res, next) => {
  if (config.allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', config.allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Last-Event-ID');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') return void res.sendStatus(204);
  }
  next();
});

// ---- per-IP rate limit for starting runs
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= config.ratePerHour) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of hits) if (!list.some((t) => now - t < 3_600_000)) hits.delete(ip);
}, 600_000).unref();

// ---- health
app.get('/api/health', (_req, res) => {
  const engine: EngineInfo = binary.path
    ? { kind: 'real', version: binary.version, detail: `Running ${path.basename(binary.path)} ${binary.version} on the server`, maxUploadMb: config.maxUploadMb }
    : { kind: 'simulation', version: '', detail: binary.problem ?? 'Program not found', maxUploadMb: config.maxUploadMb };
  res.json({ ok: true, engine, busy: runningCount(), capacity: config.maxConcurrent });
});

// ---- start a run
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      try {
        // one job per request, however many files come with it
        const r = req as Request & { job?: ReturnType<typeof createJob> };
        r.job ??= createJob();
        cb(null, r.job.inDir);
      } catch (e) {
        // Never let a file-system problem escape here: an uncaught error would stop the whole server.
        cb(e as Error, '');
      }
    },
    filename: (req, file, cb) => {
      const r = req as Request & { taken?: Set<string> };
      r.taken ??= new Set<string>();
      cb(null, safeUploadName(file.originalname, r.taken));
    },
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: config.maxFiles, fields: 4, fieldSize: config.maxOptionsKb * 1024 },
});

function readHead(file: string, n: number): string {
  const fd = openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const read = readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

app.post('/api/jobs', (req: Request, res: Response, next: NextFunction) => {
  if (!binary.path) return void res.status(503).json({ error: binary.problem ?? 'The program is not installed on the server.' });
  if (jobsDirProblem) return void res.status(503).json({ error: 'The server cannot write to its jobs folder. The administrator should check the start-up log (journalctl -u data-obfuscator-app).' });
  if (rateLimited(req.ip ?? 'unknown')) return void res.status(429).json({ error: 'Too many runs from this address. Try again later.' });
  if (runningCount() >= config.maxConcurrent) return void res.status(429).json({ error: 'The server is busy with other runs. Try again in a moment.' });

  upload.array('file', config.maxFiles)(req, res, (err?: unknown) => {
    const job = (req as Request & { job?: ReturnType<typeof createJob> }).job;
    const bail = (status: number, error: string) => {
      if (job) removeJob(job.id);
      res.status(status).json({ error });
    };
    if (err) {
      const code = (err as { code?: string }).code;
      if (code && /^E[A-Z0-9]+$/.test(code)) {
        console.error('Could not store the upload:', err);
        return bail(500, 'The server could not store the uploaded file (jobs folder not writable or disk full). The administrator should check the start-up log.');
      }
      if (code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE') return bail(400, `At most ${config.maxFiles} datasets can be masked in one run.`);
      return bail(code === 'LIMIT_FILE_SIZE' ? 413 : 400, code === 'LIMIT_FILE_SIZE' ? `The file is larger than ${config.maxUploadMb} MB.` : (err as Error).message);
    }
    const uploaded = (req.files as Express.Multer.File[] | undefined) ?? [];
    if (!job || uploaded.length === 0) return bail(400, 'Attach the dataset as the "file" field.');
    try {
      const raw = JSON.parse(String(req.body?.options ?? '{}')) as { delimiter?: string; noHeader?: boolean; commentChars?: string };
      const delimiter = ['comma', 'tab', 'semicolon', 'space'].includes(String(raw.delimiter)) ? (raw.delimiter as 'comma') : 'auto';
      const multi = uploaded.length > 1;
      // the column names of every dataset (several datasets are masked together, with one set of column options)
      const headers: string[] = [];
      for (const f of uploaded) {
        const table = parseDelimited(readHead(f.path, config.headReadKb * 1024), {
          delimiter,
          noHeader: !multi && raw.noHeader === true,
          commentChars: typeof raw.commentChars === 'string' ? raw.commentChars.slice(0, 8) : undefined,
          maxRows: 1,
        });
        for (const h of table.headers) if (!headers.includes(h)) headers.push(h);
      }
      const options = normalizeOptions(raw, headers, multi);
      writeFileSync(path.join(job.dir, 'options.json'), JSON.stringify(options, null, 2));
      res.status(202).json({ id: job.id });
      startJob(job, binary.path!, options, headers, uploaded.map((f) => f.path));
    } catch (e) {
      bail(400, e instanceof SyntaxError ? 'The options are not valid JSON.' : (e as Error).message);
    }
  });
  void next;
});

// ---- live events (Server-Sent Events, with replay)
app.get('/api/jobs/:id/events', (req, res) => {
  const job = JOB_ID_RE.test(req.params.id) ? getJob(req.params.id) : undefined;
  if (!job) return void res.status(404).json({ error: 'Unknown or expired run.' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (e: unknown, i: number) => res.write(`id: ${i}\ndata: ${JSON.stringify(e)}\n\n`);
  const from = Number(req.headers['last-event-id']);
  let next = Number.isFinite(from) ? from + 1 : 0;
  const finish = () => {
    job.listeners.delete(listener);
    clearInterval(beat);
    res.end();
  };
  const listener = (e: (typeof job.events)[number], i: number) => {
    if (i < next) return;
    next = i + 1;
    send(e, i);
    if (e.type === 'done' || e.type === 'fail') finish();
  };
  for (let i = next; i < job.events.length; i++) {
    send(job.events[i], i);
    next = i + 1;
  }
  const last = job.events[job.events.length - 1];
  if (last && (last.type === 'done' || last.type === 'fail')) return void res.end();
  job.listeners.add(listener);
  const beat = setInterval(() => res.write(': keep-alive\n\n'), config.keepAliveSeconds * 1000);
  req.on('close', () => {
    job.listeners.delete(listener);
    clearInterval(beat);
  });
});

// ---- result files
app.get('/api/jobs/:id/files/:name', (req, res) => {
  const job = JOB_ID_RE.test(req.params.id) ? getJob(req.params.id) : undefined;
  const name = req.params.name;
  if (!job || !FILE_NAME_RE.test(name)) return void res.status(404).json({ error: 'No such file.' });
  const file = path.join(job.outDir, name);
  if (path.dirname(file) !== job.outDir || !existsSync(file)) return void res.status(404).json({ error: 'No such file.' });
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.query.download === '1') res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  createReadStream(file).pipe(res);
});

app.delete('/api/jobs/:id', (req, res) => {
  if (JOB_ID_RE.test(req.params.id)) removeJob(req.params.id);
  res.sendStatus(204);
});

app.use('/api', (_req, res) => void res.status(404).json({ error: 'Not found.' }));

// ---- the built interface (production)
if (hasDist()) {
  app.use(express.static(config.distDir, { index: 'index.html', maxAge: '1h' }));
  app.get('/{*splat}', (_req, res) => res.sendFile(path.join(config.distDir, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server.' });
});

const server = app.listen(config.port, config.host, () => {
  console.log(`data-obfuscator app  http://${config.host}:${config.port}`);
  console.log(binary.path ? `  engine : real program ${binary.version} (${binary.path})` : `  engine : none — ${binary.problem}\n  looked in:\n${binary.tried.map((t) => '    ' + t).join('\n')}`);
  console.log(`  limits : ${config.maxUploadMb} MB upload, ${config.maxConcurrent} at once, ${config.timeoutSeconds}s per run, ${config.ratePerHour} runs/hour/address`);
  console.log(`  jobs   : ${config.jobsDir}${jobsDirProblem ? '  (NOT WRITABLE, see error above)' : ''}`);
  console.log(`  web    : ${hasDist() ? 'serving dist/' : 'dist/ not built (use npm run dev for the interface)'}`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => process.exit(0)));
