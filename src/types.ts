export interface Conn {
  id: number | null;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  /** Folder the connection is filed under; `null` = top level. */
  folder_id: number | null;
  /** Where the database lives (tag in the sidebar and band while connected); empty = unspecified. */
  environment: "" | "dev" | "staging" | "prod";
  /** Reach the server through an SSH tunnel. */
  ssh_enabled: boolean;
  ssh_host: string;
  ssh_port: number;
  ssh_user: string;
  ssh_auth: "key" | "password" | "agent";
  ssh_key_path: string;
  /** SSH password or key passphrase; like `password`, never returned by the backend. */
  ssh_secret: string;
  /** When false the passwords are not stored and is asked on every connect. */
  save_password: boolean;
}

export interface KnownHost {
  /** `host:port` of the SSH server. */
  server: string;
  fingerprint: string;
}

export interface VaultStatus {
  /** `null` when the system keychain works, otherwise why it does not. */
  keychainProblem: string | null;
  /** Encrypted vault used instead of the keychain; `none` = no master password yet. */
  vault: "none" | "locked" | "unlocked";
}

export interface Folder {
  id: number;
  name: string;
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
  /** PostgreSQL type name per column (`bool`, `int4`…); empty when unknown. */
  types: string[];
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
  theme: "dark" | "light" | "system";
  /** Font ids from `src/lib/fonts.ts`. */
  uiFont: string;
  editorFont: string;
  /** Interface base size and editor text size, in px. */
  uiFontSize: number;
  editorFontSize: number;
  tabSize: number;
  lineNumbers: boolean;
  keywordCase: "upper" | "lower" | "preserve";
  /** Rows per page in the results. */
  pageSize: number;
  /** `statement_timeout` of the sessions, in seconds; 0 = no limit. */
  statementTimeoutSeconds: number;
  /** Ask before running DROP, TRUNCATE, or DELETE / UPDATE without WHERE. */
  confirmDestructive: boolean;
  /** Reconnect to the last active connection when the app starts. */
  restoreConnection: boolean;
  /** Lock the master-password vault after this many idle minutes; 0 = never. */
  vaultAutoLockMinutes: number;
  /** Ask before closing a tab with unsaved changes. */
  confirmCloseDirty: boolean;
  /** Look for a new version when the app starts. */
  checkForUpdates: boolean;
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
  /** The last app version run here (see `APP_VERSION`), to show what changed after an update. */
  seenVersion: string | null;
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
