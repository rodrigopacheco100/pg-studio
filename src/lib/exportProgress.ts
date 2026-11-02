import type { ExportEntry } from "../types";

export const isRunning = (e: ExportEntry) => e.status === "running";

/** How much is done, 0–100; `null` while the total is not known (a table is still being counted). */
export function percent(e: ExportEntry): number | null {
  if (e.status === "done") return 100;
  if (e.rows_total === null) return null;
  if (e.rows_total === 0) return e.status === "running" ? 0 : 100;
  return Math.min(100, Math.floor((e.rows_done / e.rows_total) * 100));
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) [value, unit] = [value / 1024, unit + 1];
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

const rows = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "row" : "rows"}`;

/** `250 of 1,000 rows` while it runs (`250 rows` without a total), `1,000 rows` once finished. */
export function rowsText(e: ExportEntry): string {
  if (e.rows_total === null || e.status === "done") return rows(e.rows_done);
  return `${e.rows_done.toLocaleString("en-US")} of ${rows(e.rows_total)}`;
}

export const STATUS_LABELS: Record<ExportEntry["status"], string> = {
  running: "Exporting",
  done: "Done",
  cancelled: "Cancelled",
  failed: "Failed",
};
