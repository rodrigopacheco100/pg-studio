import { format } from "sql-formatter";

/** Pretty-prints a PostgreSQL script; throws if it cannot be tokenized (e.g. an unterminated string). */
export function formatSql(sql: string): string {
  return format(sql, { language: "postgresql", keywordCase: "upper", tabWidth: 2, linesBetweenQueries: 1 });
}
