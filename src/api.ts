import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Conn, HistoryEntry, QueryOutput, QueryResult, SavedQuery, Session, Settings, TableInfo } from "./types";

/** One typed wrapper per Tauri command defined in src-tauri/src/lib.rs. */
export const api = {
  listConnections: () => invoke<Conn[]>("list_connections"),
  saveConnection: (config: Conn) => invoke<number>("save_connection", { config }),
  deleteConnection: (id: number) => invoke<void>("delete_connection", { id }),
  testConnection: (config: Conn) => invoke<void>("test_connection", { config }),

  connect: (id: number) => invoke<TableInfo[]>("connect", { id }),
  disconnect: () => invoke<void>("disconnect"),
  refreshTables: () => invoke<TableInfo[]>("refresh_tables"),

  runQuery: (sql: string) => invoke<QueryOutput>("run_query", { sql }),
  tableData: (schema: string, table: string, limit: number, offset: number) =>
    invoke<QueryResult>("table_data", { schema, table, limit, offset }),

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

export const errText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
