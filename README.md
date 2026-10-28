# Data Obfuscator App

<img width="1690" height="1035" alt="image" src="https://github.com/user-attachments/assets/cbb76893-e448-4555-9619-d48552cd5062" />


A web interface for the **data-obfuscator** command-line program, which masks ADaM/SDTM dataset or NONMEM-style pharmacometric datasets so they can be shared with LLMs and collaborators.

1. **Upload** a CSV, TSV or `.dat` file, or several related datasets at once (for example ADaM `ADSL`, `ADEX`, `ADPC`), and see the first rows in an Excel-style grid (column letters, row numbers, a formula bar, a tag on each column that says what the chosen level will do to it).
2. **Choose** the masking level, seed, ID style, date shift window, scaling range, column renaming, per-column roles and which columns to keep. At levels 3 and 4 a **Protected columns** editor shows the list of columns that are never scaled; add your own or take names off. The **Treat as** choices in the column table only list what does something at the chosen level.
3. **Obfuscate** and watch the run live: progress steps and the program's own log, line by line.
4. **Read the result** in tabs: the masked data (with the changed cells highlighted against your original), the LLM prompt pack (each prompt has its own copy button), token estimates, the key map, the summary, the column report, the options used, and the log. Download one file or all of them as a zip.

The same choices are always shown as a ready-to-paste command line and options file, so a run in the app can be repeated in a terminal.

## One file or several

- **One file** runs `data-obfuscator run`, with all four levels, renaming and per-column keep/drop.
- **Two or more files** (drop them together, pick several, or press **Add datasets**) run `data-obfuscator run2`, which masks the datasets together: the same code for the same subject, study or site in every file, one date shift for all, one scale factor per column name. Levels 1 to 3 are available; level 4, renaming and the output-file name are not offered by `run2`, so the app hides them. The result has one `<name>_masked` file per dataset plus `llm2.txt`, `keymap2.txt`, `summary2.txt`, `config.used.txt` and `run2.log`. An extra switch uses the program's ADaM naming hints (`...DT`, `TRT...`, `INVID`) to recognise date, treatment and investigator columns.
- The first screen offers an **ADaM study** example of six datasets, next to the single-file examples. At most `MAX_FILES` (default 12) files fit in one run.

**Protected columns.** The list applies at levels 3 and 4 and replaces the program's default list. Standard names such as `DV` stay protected by the program even when you take them off the list; to scale one on purpose, set its **Treat as** to *Covariate to scale*, and the app then leaves it off the `--protect` list it sends.

The header carries a **Documentation** and a **Source code** button; their addresses are in `app.config.ts` (`links`).

## Two engines

| | Real program | Simulation |
|---|---|---|
| Where it runs | On the server, through the Node back end, using the Rust release binary | In the browser, no server needed |
| Result | Exactly what the command line gives | Same rules and same file formats, but not byte-identical |
| Use it for | Real data | Demos, trying options, hosting the interface statically |
| Header badge | green **Version 0.0.0.x** | amber **Simulation** |

The server looks for the binary at start-up and the page asks `/api/health` which engine is available. When the real program is present, a **Real / Simulate** switch appears in the header. With no server (or no binary) the page simulates by itself.

> The simulation is a demonstration. It does not offer the privacy guarantees of the real program, and its output differs from it. Use the real program for anything you will share.

## Run it on your computer

Requirements: Node.js 22 LTS (or 20.19 or newer). Older Node versions fail at install or start-up; check with `node -v`. For the real engine, build the Rust program once:

```bash
cd ../data-obfuscator               # the Rust project, next to this App folder
cargo build --release               # creates target/release/data-obfuscator (.exe on Windows)
```

Then:

```bash
cd App
npm install                         # if you ever changed Node versions: delete node_modules first
npm run dev                         # web page on http://localhost:5173, API on :8787
```

The server finds `../data-obfuscator/target/release/data-obfuscator` by itself. Without it, the page runs in simulation mode.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and builds the interface into `dist/` |
| `npm start` | Production server: API and the built interface on one port (default 8787) |
| `npm run typecheck` | TypeScript check only |
| `npm run smoke` | End-to-end check of a running server with the real program |

## Put it on a Linux server

See **[DEPLOYMENT.md](./DEPLOYMENT.md)**: building the binary, installing, `.env` settings, CentOS 9 install, systemd service, Apache (httpd) virtual host with live-log streaming, HTTPS, Podman/Docker, security checklist, capacity, troubleshooting and the API.

## Settings: `app.config.ts`

All settings and parameters live in one file, `app.config.ts`, which both the page and the server read:

| Section | What it holds |
|---|---|
| `brand` | App name (header and browser tab), tagline, description, footer |
| `landing` | Headline and wording of the first screen |
| `links` | Addresses of the Documentation and Source code buttons in the header |
| `samples` | Example datasets offered on the first screen (files in `public/samples/`); an entry with `files` is a multi-file example and may carry a `preset` (level, seed, column roles) |
| `levels` | The names and descriptions of the four masking levels |
| `defaults` | Starting values of the options panel: level, seed, ID style, scaling range, date-shift window, rename prefix |
| `ui` | Preview size, rows shown and added per click, panel heights, log pacing, simulation size limit |
| `simulation` | Speed of the in-browser simulation |
| `server` | Port, host, upload size, concurrency, time-out, retention, rate limit, where to look for the program, security policy |

On the server, an environment variable or `.env` entry overrides the matching value (the variable name is written next to each setting). Restart `npm start` after changing the file; `npm run dev` reloads it by itself.

## Folder map

```
App/
├─ app.config.ts              all settings (see above)
├─ src/
│  ├─ App.tsx                 page layout and state
│  ├─ components/             the page's parts, one file each:
│  │  ├─ CsvViewer.tsx        the data preview: dataset selector, column tags, change badges, row counter (uses Grid.tsx, the spreadsheet)
│  │  ├─ RunPanel.tsx         starting a run and watching it: Obfuscate card, mobile bar, live output (uses RunConsole.tsx and Results.tsx)
│  │  └─ ColumnTable, SettingsPanel, CommandPreview, Dropzone, Header, ...
│  ├─ lib/                    server calls, run state, zip download
│  └─ shared/                 code used by the browser AND the server
│     ├─ options.ts           chosen options -> command-line arguments, options file, validation
│     ├─ plan.ts, detect.ts   which role each column gets (same name table as the program)
│     ├─ mockEngine.ts        the in-browser simulation of `run`
│     ├─ mockRun2.ts          the in-browser simulation of `run2` (several datasets)
│     └─ csv.ts, steps.ts     parsing, and mapping the program's log lines to progress steps
├─ server/                    Express: upload, run the binary, live events, result files
├─ deploy/                    systemd unit, Apache include file, Dockerfile
├─ scripts/                   smoke tests
└─ public/samples/            example datasets offered on the first screen
```

## How the options reach the program

`src/shared/options.ts` turns the page's choices into arguments such as `--level=2 --seed=42 --drop=COMMENT --rename-except=ID,TIME`. Only settings that differ from the program's defaults are added, except `--level` and `--seed`, which are always explicit so a run can be repeated. The server runs the program with these as an argument list, never through a shell.

## Limits worth knowing

- The page previews at most the first 500 rows. The program always processes the whole file.
- Browser simulation accepts files up to 10 MB. The real engine accepts up to `MAX_UPLOAD_MB` (default 50) per file and `MAX_FILES` (default 12) files per run.
- The real program finishes small files in milliseconds. The page releases its log at a readable pace so the run can be followed; the files are already complete.
- There is no sign-in. Put the app behind your own access control before using it with real data.
