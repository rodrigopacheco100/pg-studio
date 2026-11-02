export interface StatementRange {
  /** First significant character (no leading whitespace or comments). */
  from: number;
  /** Exclusive end, before the `;` that terminates the statement. */
  to: number;
}

function trimEnd(doc: string, end: number) {
  while (/\s/.test(doc[end - 1])) end--;
  return end;
}

/**
 * Statements of a script, separated by `;` outside strings, quoted identifiers,
 * comments (`--`, `/* *​/`) and `$tag$…$tag$` blocks. Comment-only chunks do not count.
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
      if (c === "'" || c === '"') {
        i++;
        // Doubled quotes inside the literal are an escape, not a closing quote.
        while (i < doc.length && !(doc[i] === c && doc[i + 1] !== c)) i += doc[i] === c ? 2 : 1;
        i++;
      } else if (c === "$") {
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
