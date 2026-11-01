import { invoke } from "@tauri-apps/api/core";
import type { Conn, HistoryEntry, QueryOutput, QueryResult, SavedQuery, Settings, TableInfo } from "./types";

/** Um wrapper tipado por comando Tauri definido em src-tauri/src/lib.rs. */
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

  deleteSavedQuery: (id: number) => invoke<void>("delete_saved_query", { id }),
};

export const errText = (e: unknown) => (typeof e === "string" ? e : e instanceof Error ? e.message : String(e));
