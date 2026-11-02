import { format } from "sql-formatter";

export interface FormatOptions {
  keywordCase: "upper" | "lower" | "preserve";
  tabSize: number;
}

/** Pretty-prints a PostgreSQL script; throws if it cannot be tokenized (e.g. an unterminated string). */
export function formatSql(sql: string, { keywordCase, tabSize }: FormatOptions): string {
  return format(sql, { language: "postgresql", keywordCase, tabWidth: tabSize, linesBetweenQueries: 1 });
}
