/**
 * Data Obfuscator: app settings in one place.
 *
 * Everything you might want to adjust lives here: names and wording, the defaults the page starts
 * with, the sample files, display limits, and the server's limits and locations.
 *
 *  - The web page and the server both read this file.
 *  - Server values can be overridden without editing this file, through environment variables or a
 *    `.env` file (see `.env.example`). The variable name is shown next to each server setting.
 *  - Keep this file free of secrets and of Node-only code, because the browser bundle imports it.
 *  - Masking behaviour itself (what each level does) belongs to the data-obfuscator program, not here.
 */

// ---------------------------------------------------------------------------------------------
// Names and wording
// ---------------------------------------------------------------------------------------------
export const brand = {
  /** Shown in the header and in the browser tab. */
  name: 'Data Obfuscator',
  /** One line next to the name in the header (hidden on small screens). */
  tagline: 'Mask NONMEM-style datasets before you share them',
  /** Meta description of the page. */
  description: 'Mask NONMEM-style datasets in your browser: preview, choose options, watch the run, and download the masked data.',
  footer: 'A web front end for the data-obfuscator command-line program. The masked data keeps the PK/PD structure; always check it before sharing.',
} as const;

/** Header buttons that open other pages (in a new tab). */
export const links = {
  docs: { label: 'Documentation', url: 'https://hyperpkpd.com/data-obfuscator/docs' },
  source: { label: 'Source code', url: 'https://github.com/HyperPKPD/data-obfuscator' },
} as const;

/** The first screen, before a file is loaded. */
export const landing = {
  headline: 'Share the data with AI, not the people or sensitive information in it.',
  intro:
    'Drop a NONMEM-style dataset, or several related datasets such as ADaM. You get a spreadsheet preview, a set of masking choices, a live view of the run, and every output file: the masked data, the key, the reports and a prompt pack for your LLM.',
  points: [
    { tone: 'mask', text: 'Identifiers, dates and covariates are masked. TIME, DV, AMT and the other modelling columns stay untouched.' },
    { tone: 'safe', text: 'Same file, options and seed always give the same masked file.' },
  ],
  /** Last bullet depends on the engine in use. */
  engineNote: {
    checking: 'Checking which engine is available…',
    real: 'Your file is sent to the server that runs the real data-obfuscator program, then deleted after the run.',
    simulation: 'This is a browser simulation. Your file never leaves this page, and the result is for demonstration, not for real privacy.',
  },
  dropTitle: 'Drop your dataset here',
  samplesHeading: 'No file at hand? Try an example',
} as const;

/**
 * Example datasets offered on the first screen. The files live in `public/samples/`.
 * `files` lists every file of an example that is a SET of datasets (they are masked together with
 * the program's `run2` command); `preset` fills the options the way the program's own example config does.
 */
export interface Sample {
  file: string;
  title: string;
  note: string;
  files?: readonly string[];
  preset?: {
    level: 1 | 2 | 3;
    seed: number;
    /** Column name -> role, for columns the program cannot recognise by name. */
    roles: Readonly<Record<string, 'covariate' | 'freetext' | 'date' | 'sensitive'>>;
  };
}

export const samples: readonly Sample[] = [
  { file: 'sample.csv', title: 'Oral PK, 20 subjects', note: 'Clean dataset with IDs, dates, covariates and free text' },
  { file: 'pk_oral_pooled_multi_id.csv', title: 'Pooled studies', note: 'Several ID and study columns in one file' },
  { file: 'pkpd_dvid_endpoints.tsv', title: 'PK/PD endpoints', note: 'Tab-separated, DVID marks the endpoint' },
  { file: 'qc_nearly_clean.csv', title: 'Nearly clean', note: 'A few planted data problems to find' },
  {
    file: 'adam',
    title: 'ADaM study, 6 datasets',
    note: 'ADSL, ADEX, ADPC, ADLB, ADVS and ADAE masked together, so an LLM can still join them',
    files: ['adam/adsl.csv', 'adam/adex.csv', 'adam/adpc.csv', 'adam/adlb.csv', 'adam/advs.csv', 'adam/adae.csv'],
    preset: { level: 3, seed: 20261014, roles: { WEIGHTBL: 'covariate', CRCLBL: 'covariate', COMMENT: 'freetext', CONTACT: 'freetext', AETERM: 'freetext' } },
  },
];

/** The four masking levels as described on the page. */
export const levels = [
  { level: 1, name: 'Light', text: 'Subject, study, site and user identifiers become codes.' },
  { level: 2, name: 'Clinical', text: 'Also recodes treatment, sex, race and country, shifts dates, and blanks free text. The usual choice.' },
  { level: 3, name: 'Covariate', text: 'Also multiplies or divides covariates such as weight and age by a hidden factor.' },
  { level: 4, name: 'Maximum', text: 'Also removes free-text columns and orders the rows by masked ID.' },
] as const;

// ---------------------------------------------------------------------------------------------
// Starting values of the options panel. You may change them (for example a different seed or date
// window); the app then sends flags for anything that differs from the program's own defaults.
// ---------------------------------------------------------------------------------------------
export const defaults = {
  level: 2 as 1 | 2 | 3 | 4,
  seed: 42,
  idStyle: 'sequential' as 'sequential' | 'padded' | 'hashed',
  /** Hidden factor range for scaled covariates (level 3 and up). */
  scale: { min: 1, max: 20 },
  /** Date shift in days (level 2 and up): random draw between min and max, or a fixed number. */
  dateShift: { min: 1, max: 100, fixed: 23.6 },
  renamePrefix: 'COL',
  /** Lines starting with one of these characters are skipped when reading the file. */
  commentChars: '#;$',
  writeKeymap: true,
} as const;

// ---------------------------------------------------------------------------------------------
// Page behaviour
// ---------------------------------------------------------------------------------------------
export const ui = {
  /** Only this much of a file is read for the preview (the program always processes the whole file). */
  previewBytes: 3 * 1024 * 1024,
  /** Most rows the preview and the result grid can ever show. */
  maxPreviewRows: 500,
  /** Rows shown at first, and how many more each "Show more rows" adds. */
  inputRows: { initial: 25, step: 75 },
  resultRows: { initial: 50, step: 100 },
  /** Width of the options panel on the right, in pixels (large screens). */
  sidePanelWidth: 480,
  /** Grid and log heights, in pixels. */
  gridMaxHeight: 420,
  resultGridMaxHeight: 460,
  consoleHeight: 300,
  /** How long to wait for the server to say which engine it has before falling back to simulation. */
  healthTimeoutMs: 3000,
  /**
   * The real program finishes small files in milliseconds. Log lines are released at this pace so a
   * person can follow the run; a long backlog is released faster (one tick shows backlog / divisor).
   */
  logPacing: { tickMs: 40, backlogDivisor: 40 },
  /** Largest file the in-browser simulation accepts. */
  simulationMaxMb: 10,
  /** Most datasets one run can hold (also enforced by the server, see `server.maxFiles`). */
  maxFiles: 12,
} as const;

/** The in-browser simulation. 1 = normal pauses, 0 = none, 2 = twice as slow. */
export const simulation = {
  speed: 1,
} as const;

// ---------------------------------------------------------------------------------------------
// Server (used by `server/`). Environment variables override these values.
// ---------------------------------------------------------------------------------------------
export const server = {
  /** PORT. */
  port: 8787,
  /** HOST. Keep 127.0.0.1 behind a reverse proxy; use 0.0.0.0 only inside a container. */
  host: '127.0.0.1',
  /** JOBS_DIR. Where uploads and results live while a job exists. Relative to the app folder. */
  jobsDir: './.jobs',
  /** MAX_UPLOAD_MB. Largest single file. */
  maxUploadMb: 50,
  /** MAX_FILES. Most datasets in one run (several files are masked together with `run2`). */
  maxFiles: 12,
  /** MAX_CONCURRENT_JOBS. */
  maxConcurrentJobs: 2,
  /** JOB_TIMEOUT_SECONDS. A longer run is stopped. */
  jobTimeoutSeconds: 120,
  /** JOB_TTL_MINUTES. Job folders older than this are deleted. */
  jobTtlMinutes: 30,
  /** RATE_LIMIT_PER_HOUR. Runs one visitor address may start per hour. */
  ratePerHour: 40,
  /** TRUST_PROXY=1. Read the visitor address from X-Forwarded-For (needed behind Apache or another proxy). */
  trustProxy: false,
  /** ALLOWED_ORIGIN. Only if the web files are hosted on a different site than the API. */
  allowedOrigin: '',
  /** Seconds between "still alive" lines on the live event stream. */
  keepAliveSeconds: 15,
  /** How often expired job folders are looked for, in minutes. */
  cleanupEveryMinutes: 1,
  /** Largest single option field the server accepts, in KB (the options are a small JSON text). */
  maxOptionsKb: 1024,
  /** How much of the start of an upload is read to find the column names, in KB. */
  headReadKb: 256,
  /**
   * Where to look for the data-obfuscator program, in order, relative to the app folder.
   * DATA_OBFUSCATOR_BIN (a full path) is tried before these.
   */
  binarySearch: ['bin', '../data-obfuscator/target/release', '../target/release'],
  /** Content-Security-Policy sent in production. */
  contentSecurityPolicy:
    "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
} as const;

/** Port of the development API that Vite proxies `/api` to, and the port Vite itself serves on. */
export const dev = {
  webPort: 5173,
} as const;
