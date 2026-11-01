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

/** Resumo da última execução (query ou página de tabela), exibido no rodapé. */
export interface RunInfo {
  label: string;
  status: "running" | "ok" | "error";
  durationMs?: number;
  rows?: number;
  statements?: number;
  /** Linhas afetadas, quando a última instrução não retorna colunas. */
  affected?: number;
  message?: string;
}

/** Espelha `Settings` em src-tauri/src/settings.rs (camelCase). */
export interface Settings {
  sidebarWidth: number;
  editorHeight: number;
}
