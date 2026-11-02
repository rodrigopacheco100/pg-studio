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

/** Is there no `WHERE`, at the depth of the DELETE/UPDATE at `ws[i]`, before its statement (or CTE body) ends? */
function unfiltered(ws: Word[], i: number): boolean {
  const { depth } = ws[i];
  for (let j = i + 1; j < ws.length && ws[j].depth >= depth; j++) {
    if (ws[j].depth === depth && ws[j].text === "WHERE") return false;
  }
  return true;
}

/**
 * Does the DELETE/UPDATE at `ws[i]` start a statement? That is the first word, the first word of a
 * data-modifying CTE body (`WITH x AS (DELETE ...)`: it opens a deeper level), or the main verb after
 * the CTEs. Not the `ON DELETE` of a constraint or the `DO UPDATE` of an upsert.
 */
function isVerb(ws: Word[], i: number): boolean {
  const w = ws[i];
  if (w.text !== "DELETE" && w.text !== "UPDATE") return false;
  if (i === 0 || ws[i - 1].depth < w.depth) return true;
  return ws[0].text === "WITH" && w.depth === 0 && !ws.slice(0, i).some((x) => x.depth === 0 && /^(SELECT|INSERT|DELETE|UPDATE)$/.test(x.text));
}

/** The reasons a single statement is risky. */
function risks(sql: string): string[] {
  const ws = words(sql);
  const first = ws[0]?.text;
  if (first === "DROP" || first === "TRUNCATE") return [first];
  // `ALTER TABLE ... DROP COLUMN / CONSTRAINT`: anything but the harmless `DROP DEFAULT` / `DROP NOT NULL`.
  if (first === "ALTER") {
    const drops = ws.filter((w, i) => w.depth === 0 && w.text === "DROP" && !/^(DEFAULT|NOT|EXPRESSION|IDENTITY)$/.test(ws[i + 1]?.text ?? ""));
    return drops.length > 0 ? ["ALTER ... DROP"] : [];
  }
  // DELETE/UPDATE: the statement itself, or the body of a data-modifying CTE (`WITH x AS (DELETE ...)`).
  const out: string[] = [];
  ws.forEach((w, i) => {
    if (isVerb(ws, i) && unfiltered(ws, i)) out.push(`${w.text} without WHERE`);
  });
  return out;
}

/** The statements of `sql` that destroy data: `DROP`, `TRUNCATE`, `ALTER ... DROP`, and `DELETE` / `UPDATE` without `WHERE` (also inside a CTE). */
export function destructiveStatements(sql: string): Destructive[] {
  const found: Destructive[] = [];
  for (const { from, to } of splitStatements(sql)) {
    const statement = sql.slice(from, to);
    const oneLine = statement.replace(/\s+/g, " ");
    const sql80 = oneLine.length > 80 ? `${oneLine.slice(0, 80)}…` : oneLine;
    for (const reason of risks(statement)) found.push({ reason, sql: sql80 });
  }
  return found;
}
