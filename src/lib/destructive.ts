import { splitStatements } from "./statements";

export interface Destructive {
  /** What makes it risky, e.g. `DELETE without WHERE`. */
  reason: string;
  /** The statement, shortened for display. */
  sql: string;
}

interface Word {
  text: string;
  /** Parenthesis nesting at the word. */
  depth: number;
}

/** Keywords and identifiers of a statement, upper-cased; strings, quoted names and comments are skipped. */
function words(sql: string): Word[] {
  const out: Word[] = [];
  let depth = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "-" && sql[i + 1] === "-") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
    } else if (c === "'" || c === '"') {
      i++;
      while (i < sql.length && !(sql[i] === c && sql[i + 1] !== c)) i += sql[i] === c ? 2 : 1;
      i++;
    } else if (c === "$" && /^\$(?:[A-Za-z_]\w*)?\$/.test(sql.slice(i, i + 64))) {
      const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(sql.slice(i, i + 64))![0];
      const end = sql.indexOf(tag, i + tag.length);
      i = end === -1 ? sql.length : end + tag.length;
    } else if (c === "(") {
      depth++;
      i++;
    } else if (c === ")") {
      depth--;
      i++;
    } else if (/[A-Za-z_]/.test(c)) {
      const word = /^\w+/.exec(sql.slice(i))![0];
      out.push({ text: word.toUpperCase(), depth });
      i += word.length;
    } else i++;
  }
  return out;
}

/** The reason a single statement is risky, or `null`. */
function risk(sql: string): string | null {
  const ws = words(sql);
  const first = ws[0]?.text;
  if (first === "DROP" || first === "TRUNCATE") return first;
  // `WITH ... DELETE/UPDATE`: the verb is the first one outside the CTE parentheses.
  const verb = first === "WITH" ? ws.find((w) => w.depth === 0 && (w.text === "DELETE" || w.text === "UPDATE")) : ws[0];
  if (verb?.text !== "DELETE" && verb?.text !== "UPDATE") return null;
  const rest = ws.slice(ws.indexOf(verb) + 1);
  return rest.some((w) => w.depth === 0 && w.text === "WHERE") ? null : `${verb.text} without WHERE`;
}

/** The statements of `sql` that destroy data: `DROP`, `TRUNCATE`, and `DELETE` / `UPDATE` without `WHERE`. */
export function destructiveStatements(sql: string): Destructive[] {
  const found: Destructive[] = [];
  for (const { from, to } of splitStatements(sql)) {
    const statement = sql.slice(from, to);
    const reason = risk(statement);
    if (!reason) continue;
    const oneLine = statement.replace(/\s+/g, " ");
    found.push({ reason, sql: oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine });
  }
  return found;
}
