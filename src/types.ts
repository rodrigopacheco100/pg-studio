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
  /** Font ids from `src/lib/fonts.ts`. */
  uiFont: string;
  editorFont: string;
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

export type DetailKind = "columns" | "constraints" | "foreign_keys" | "indexes" | "permissions";

export interface DetailItem {
  name: string;
  detail: string;
}

/** Per-kind documents returned by `table_item` (see `pg::table_item` in src-tauri/src/pg.rs). */
export interface ColumnDetails {
  name: string;
  position: number;
  type: string;
  notNull: boolean;
  default: string | null;
  identity: string | null;
  generated: string | null;
  collation: string | null;
  storage: string;
  statisticsTarget: number | null;
  comment: string | null;
  constraints: { name: string; definition: string }[];
  indexes: string[];
  referencedBy: { name: string; table: string; definition: string }[];
}

export interface ConstraintDetails {
  name: string;
  type: string;
  definition: string;
  columns: string[];
  deferrable: boolean;
  deferred: boolean;
  validated: boolean;
  noInherit: boolean;
  index: string | null;
  comment: string | null;
}

export interface ForeignKeyDetails {
  name: string;
  definition: string;
  referencedTable: string;
  columns: { column: string; referencedColumn: string }[];
  onUpdate: string;
  onDelete: string;
  match: string;
  deferrable: boolean;
  deferred: boolean;
  validated: boolean;
  comment: string | null;
}

export interface IndexDetails {
  name: string;
  definition: string;
  method: string;
  unique: boolean;
  primary: boolean;
  valid: boolean;
  clustered: boolean;
  predicate: string | null;
  /** How many of `columns` are key columns; the rest are INCLUDE columns. */
  keyColumns: number;
  columns: string[];
  size: string;
  tablespace: string | null;
  constraint: string | null;
  comment: string | null;
}

export interface PermissionDetails {
  grantee: string;
  owner: string | null;
  privileges: { privilege: string; grantor: string; grantable: boolean }[];
  /** Only privileges granted on specific columns, not those implied by a table-level grant. */
  columnPrivileges: { column: string; privilege: string; grantable: boolean }[];
}

export interface ItemDetailsMap {
  columns: ColumnDetails;
  constraints: ConstraintDetails;
  foreign_keys: ForeignKeyDetails;
  indexes: IndexDetails;
  permissions: PermissionDetails;
}
