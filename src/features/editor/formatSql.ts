export interface FormatOptions {
  keywordCase: "upper" | "lower" | "preserve";
  tabSize: number;
}

/**
 * Pretty-prints a PostgreSQL script; rejects if it cannot be tokenized (e.g. an unterminated string).
 * The formatter is loaded on first use, so it stays out of the startup bundle.
 */
export async function formatSql(sql: string, { keywordCase, tabSize }: FormatOptions): Promise<string> {
  const { format } = await import("sql-formatter");
  return format(sql, { language: "postgresql", keywordCase, tabWidth: tabSize, linesBetweenQueries: 1 });
}
