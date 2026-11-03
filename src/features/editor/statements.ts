export interface StatementRange {
  /** First significant character (no leading whitespace or comments). */
  from: number;
  /** Exclusive end, before the `;` that terminates the statement. */
  to: number;
}

/**
 * Index just after the quoted string or identifier that opens at `sql[i]` (`'` or `"`); doubled quotes are an
 * escape. In an escape string (`E'...'`) a backslash also escapes the next character, so `E'it\'s'` is one string.
 */
export function skipQuoted(sql: string, i: number): number {
  const q = sql[i];
  const escapes = q === "'" && /^[eE]$/.test(sql[i - 1] ?? "") && !/\w/.test(sql[i - 2] ?? "");
  i++;
  while (i < sql.length) {
    if (escapes && sql[i] === "\\") i += 2;
    else if (sql[i] === q) {
      if (sql[i + 1] !== q) return i + 1;
      i += 2;
    } else i++;
  }
  return sql.length;
}

function trimEnd(doc: string, end: number) {
  while (/\s/.test(doc[end - 1])) end--;
  return end;
}

/**
 * Statements of a script, separated by `;` outside strings, quoted identifiers,
 * comments (`--`, `/* *​/`) and `$tag$…$tag$` blocks (backslash escapes in `E'...'` included). Comment-only chunks do not count.
 */
export function splitStatements(doc: string): StatementRange[] {
  const out: StatementRange[] = [];
  let from = -1;
  let i = 0;
  const skipTo = (end: number) => (i = end === -1 ? doc.length : end);

  while (i < doc.length) {
    const c = doc[i];
    const next = doc[i + 1];
    if (c === "-" && next === "-") {
      skipTo(doc.indexOf("\n", i));
    } else if (c === "/" && next === "*") {
      const end = doc.indexOf("*/", i + 2);
      skipTo(end === -1 ? -1 : end + 2);
    } else if (/\s/.test(c)) {
      i++;
    } else if (c === ";") {
      if (from !== -1) out.push({ from, to: trimEnd(doc, i) });
      from = -1;
      i++;
    } else {
      if (from === -1) from = i;
      if (c === "'" || c === '"') i = skipQuoted(doc, i);
      else if (c === "$") {
        const tag = /^\$(?:[A-Za-z_]\w*)?\$/.exec(doc.slice(i, i + 64))?.[0];
        if (tag) {
          const end = doc.indexOf(tag, i + tag.length);
          skipTo(end === -1 ? -1 : end + tag.length);
        } else i++;
      } else i++;
    }
  }
  if (from !== -1) out.push({ from, to: trimEnd(doc, doc.length) });
  return out;
}

/** Statement under the cursor; between two statements the previous one counts (or the first, if there is none). */
export function statementAtCursor(doc: string, pos: number): string {
  const all = splitStatements(doc);
  const found = all.find((r) => r.from <= pos && pos <= r.to) ?? all.filter((r) => r.to < pos).pop() ?? all[0];
  return found ? doc.slice(found.from, found.to) : "";
}
