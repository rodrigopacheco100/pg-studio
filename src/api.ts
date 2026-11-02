import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Conn, DetailItem, Folder, KnownHost, DetailKind, ItemDetailsMap, HistoryEntry, QueryOutput, QueryResult, SavedQuery, Session, Settings, StoredTheme, TableInfo, VaultStatus } from "./types";

/** One typed wrapper per Tauri command defined in src-tauri/src/lib.rs. */
export const api = {
  listConnections: () => invoke<Conn[]>("list_connections"),
  saveConnection: (config: Conn) => invoke<number>("save_connection", { config }),
  deleteConnection: (id: number) => invoke<void>("delete_connection", { id }),
  reorderConnections: (items: { id: number; folder_id: number | null }[]) => invoke<void>("reorder_connections", { items }),
  listThemes: () => invoke<StoredTheme[]>("list_themes"),
  saveTheme: (id: string, content: string) => invoke<void>("save_theme", { id, content }),
  deleteTheme: (id: string) => invoke<void>("delete_theme", { id }),
  listKnownHosts: () => invoke<KnownHost[]>("list_known_hosts"),
  forgetKnownHost: (server: string) => invoke<void>("forget_known_host", { server }),
  vaultStatus: () => invoke<VaultStatus>("vault_status"),
  /** Creates (`create`) or unlocks the master-password vault used when there is no system keychain. */
  vaultOpen: (password: string, create: boolean) => invoke<void>("vault_open", { password, create }),
  listFolders: () => invoke<Folder[]>("list_folders"),
  createFolder: (name: string) => invoke<number>("create_folder", { name }),
  renameFolder: (id: number, name: string) => invoke<void>("rename_folder", { id, name }),
  deleteFolder: (id: number) => invoke<void>("delete_folder", { id }),
  reorderFolders: (ids: number[]) => invoke<void>("reorder_folders", { ids }),
  testConnection: (config: Conn) => invoke<void>("test_connection", { config }),

  connect: (id: number, password?: string, sshSecret?: string) => invoke<TableInfo[]>("connect", { id, password, sshSecret }),
  disconnect: () => invoke<void>("disconnect"),
  refreshTables: () => invoke<TableInfo[]>("refresh_tables"),

  /** `statements` are the individual statements of `sql`; the backend uses them to learn the column types. */
  runQuery: (sql: string, statements: string[]) => invoke<QueryOutput>("run_query", { sql, statements }),
  tableData: (schema: string, table: string, limit: number, offset: number) =>
    invoke<QueryResult>("table_data", { schema, table, limit, offset }),

  tableDetails: (schema: string, table: string, kind: DetailKind) =>
    invoke<DetailItem[]>("table_details", { schema, table, kind }),
  tableItem: <K extends DetailKind>(schema: string, table: string, kind: K, name: string) =>
    invoke<ItemDetailsMap[K]>("table_item", { schema, table, kind, name }),
  tableCount: (schema: string, table: string) => invoke<number>("table_count", { schema, table }),

  listHistory: () => invoke<HistoryEntry[]>("list_history"),
  clearHistory: () => invoke<void>("clear_history"),
  listSavedQueries: () => invoke<SavedQuery[]>("list_saved_queries"),
  saveQuery: (query: SavedQuery) => invoke<void>("save_query", { query }),
  getSettings: () => invoke<Settings>("get_settings"),
  setSettings: (settings: Settings) => invoke<void>("set_settings", { settings }),

  getSession: () => invoke<Session>("get_session"),
  setSession: (session: Session) => invoke<void>("set_session", { session }),

  deleteSavedQuery: (id: number) => invoke<void>("delete_saved_query", { id }),
};

const SQL_FILTERS = [{ name: "SQL", extensions: ["sql"] }, { name: "All files", extensions: ["*"] }];

/** SQL script files: native dialogs plus reading/writing through the backend. */
export const files = {
  /** Paths picked by the user, or `[]` if the dialog was cancelled. */
  pickToOpen: async () => {
    const picked = await open({ multiple: true, filters: SQL_FILTERS });
    return picked ?? [];
  },
  pickToSave: (defaultPath: string) => save({ defaultPath, filters: SQL_FILTERS }),
  read: (path: string) => invoke<string>("read_text_file", { path }),
  write: (path: string, content: string) => invoke<void>("write_text_file", { path, content }),
};

/** A theme JSON file picked by the user; `null` if the dialog was cancelled. */
export const pickThemeFile = () => open({ multiple: false, filters: [{ name: "Theme", extensions: ["json"] }, { name: "All files", extensions: ["*"] }] });

/** Where to save a theme file; `null` if the dialog was cancelled. */
export const pickThemeToSave = (defaultPath: string) => save({ defaultPath, filters: [{ name: "Theme", extensions: ["json"] }] });

/** Private key file for the SSH tunnel; `null` if the dialog was cancelled. */
export const pickKeyFile = () => open({ multiple: false });

export const errText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
