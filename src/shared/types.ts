// Types shared by the browser app, the in-browser simulation and the Node server.

export type Level = 1 | 2 | 3 | 4;
export type IdStyle = 'sequential' | 'padded' | 'hashed';
export type DelimiterChoice = 'auto' | 'comma' | 'tab' | 'semicolon' | 'space';

/** What a user can say a column is. `auto` keeps the program's own name-based detection. */
export type RoleChoice =
  | 'auto'
  | 'id'
  | 'subject'
  | 'study'
  | 'site'
  | 'user'
  | 'treatment'
  | 'date'
  | 'freetext'
  | 'covariate'
  | 'sensitive'
  | 'protect';

export type RenameMode = 'off' | 'selected' | 'except';
export type DateShiftMode = 'random' | 'fixed';

export interface ColumnSetting {
  /** Role chosen by the user; `auto` = detect from the column name. */
  role: RoleChoice;
  /** false = the column is dropped from the output. */
  keep: boolean;
  /** In `selected` mode: rename this column. In `except` mode: keep this column's name. */
  renameFlag: boolean;
  /** Name to use instead of an automatic one (empty = automatic). */
  newName: string;
}

export interface Options {
  level: Level;
  seed: number;
  idStyle: IdStyle;
  columns: Record<string, ColumnSetting>;
  scaleMin: number;
  scaleMax: number;
  dateShiftMode: DateShiftMode;
  dateShiftMin: number;
  dateShiftMax: number;
  dateShiftFixed: number;
  renameMode: RenameMode;
  renamePrefix: string;
  writeKeymap: boolean;
  dropFreetext: boolean;
  /**
   * Columns that must never be altered. Starts as the program's own list. Only used from level 3,
   * where it decides which columns may be scaled. Columns the user scales on purpose are left out of
   * what is sent (see `effectiveProtect`).
   */
  protect: string[];
  /** Several datasets only (`run2`): recognise ADaM column names such as ADT or TRT01P. */
  adamHints: boolean;
  delimiter: DelimiterChoice;
  noHeader: boolean;
  commentChars: string;
  verbose: boolean;
  outputName: string;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  delimiter: 'comma' | 'tab' | 'semicolon' | 'space';
  /** Rows in the whole file (data rows, not counting the header). */
  totalRows: number;
  hadHeader: boolean;
}

/** `run` masks one dataset; `run2` masks several together with shared codes. */
export type RunCommand = 'run' | 'run2';

export type RunStep =
  | 'read'
  | 'plan'
  | 'mask'
  | 'write'
  | 'reports'
  | 'prompts'
  | 'tokens'
  | 'done';

export type LogLevel = 'info' | 'ok' | 'warn' | 'error' | 'debug' | 'plain';

export type RunEvent =
  | { type: 'log'; level: LogLevel; text: string }
  | { type: 'step'; step: RunStep }
  | { type: 'done'; files: ResultFile[]; warnings: number }
  | { type: 'fail'; message: string };

export interface ResultFile {
  name: string;
  size: number;
  /** Text content, filled in by the client after the run. */
  text?: string;
}

export interface EngineInfo {
  kind: 'real' | 'simulation';
  version: string;
  detail: string;
  maxUploadMb: number;
}
