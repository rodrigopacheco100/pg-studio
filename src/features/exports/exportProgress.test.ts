import { expect, test } from "bun:test";
import type { ExportEntry } from "@/types";
import { formatBytes, formatDuration, percent, rowsText } from "./exportProgress";

const entry = (over: Partial<ExportEntry>): ExportEntry => ({
  id: 1, source: "public.t", format: "csv", path: "/tmp/t.csv", status: "running",
  rows_done: 0, rows_total: 1000, bytes: 0, error: null, started_at: "2026-01-01 10:00:00", duration_ms: null, ...over,
});

test("percent is rows done over the total, whole numbers, capped", () => {
  expect(percent(entry({ rows_done: 250 }))).toBe(25);
  expect(percent(entry({ rows_done: 999 }))).toBe(99); // never 100 before it is done
  expect(percent(entry({ rows_done: 1200 }))).toBe(100);
});

test("percent is unknown until the total is, and full when done", () => {
  expect(percent(entry({ rows_total: null, rows_done: 40 }))).toBeNull();
  expect(percent(entry({ rows_total: null, status: "done" }))).toBe(100);
  expect(percent(entry({ rows_total: 0, status: "running" }))).toBe(0);
  expect(percent(entry({ rows_total: 0, status: "done" }))).toBe(100);
});

test("a cancelled export keeps the percentage it reached", () => {
  expect(percent(entry({ status: "cancelled", rows_done: 500 }))).toBe(50);
});

test("rowsText", () => {
  expect(rowsText(entry({ rows_done: 250 }))).toBe("250 of 1,000 rows");
  expect(rowsText(entry({ rows_total: null, rows_done: 1 }))).toBe("1 row");
  expect(rowsText(entry({ status: "done", rows_done: 1000 }))).toBe("1,000 rows");
});

test("formatBytes and formatDuration", () => {
  expect(formatBytes(512)).toBe("512 B");
  expect(formatBytes(1536)).toBe("1.5 KB");
  expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
  expect(formatBytes(300 * 1024 * 1024)).toBe("300 MB");
  expect(formatDuration(80)).toBe("80 ms");
  expect(formatDuration(2500)).toBe("2.5 s");
  expect(formatDuration(125000)).toBe("2 min 5 s");
});
