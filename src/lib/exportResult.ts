import type { QueryResult, TableRef } from "../types";
import { toCsv, toInsert, toJson } from "./rowFormat";

export type ExportFormat = "csv" | "json" | "insert";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; extension: string }[] = [
  { id: "csv", label: "CSV", extension: "csv" },
  { id: "json", label: "JSON", extension: "json" },
  { id: "insert", label: "SQL INSERT", extension: "sql" },
];

/** `LIMIT` that means every row of a table (`table_data` takes a `u32`). */
export const ALL_ROWS = 4294967295;

/** The text of a file with all the rows of `result`. INSERT needs the table the rows come from. */
export function formatResult(format: ExportFormat, result: QueryResult, table?: TableRef): string {
  switch (format) {
    case "csv":
      return toCsv(result.columns, result.rows) + "\n";
    case "json":
      return toJson(result.columns, result.rows, result.types) + "\n";
    case "insert":
      if (!table) throw new Error("INSERT statements need the table the rows come from");
      return toInsert(table, result.columns, result.rows) + "\n";
  }
}
