import type { ExportFormat } from "../types";

export const EXPORT_FORMATS: { id: ExportFormat; label: string; extension: string }[] = [
  { id: "csv", label: "CSV", extension: "csv" },
  { id: "json", label: "JSON", extension: "json" },
  { id: "insert", label: "SQL INSERT", extension: "sql" },
];

export const formatLabel = (format: ExportFormat) => EXPORT_FORMATS.find((f) => f.id === format)!.label;
