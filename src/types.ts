export interface Conn {
  id: number | null;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  kind: string;
  columns: ColumnInfo[];
}

export interface TableRef {
  schema: string;
  name: string;
}

export interface QueryResult {
  columns: string[];
  rows: (string | null)[][];
  affected: number | null;
}

export interface QueryOutput {
  results: QueryResult[];
  duration_ms: number;
}

export interface HistoryEntry {
  id: number;
  sql: string;
  ran_at: string;
  duration_ms: number;
  error: string | null;
}

export interface SavedQuery {
  id: number | null;
  name: string;
  sql: string;
}

/** Summary of the last execution (query or table page), shown in the footer. */
export interface RunInfo {
  label: string;
  status: "running" | "ok" | "error";
  durationMs?: number;
  rows?: number;
  statements?: number;
  /** Affected rows, when the last statement returns no columns. */
  affected?: number;
  message?: string;
}

/** Mirrors `Settings` in src-tauri/src/settings.rs (camelCase). */
export interface Settings {
  sidebarWidth: number;
  editorHeight: number;
}

/** Mirrors `SessionDoc` in src-tauri/src/session.rs. */
export interface SessionDoc {
  id: number;
  path: string | null;
  name: string;
  sql: string;
  saved: string;
}

/** Mirrors `Session` in src-tauri/src/session.rs. */
export interface Session {
  docs: SessionDoc[];
  activeDoc: number | null;
  connectionId: number | null;
}
