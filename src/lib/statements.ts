export interface StatementRange {
  /** Primeiro caractere significativo (sem espaços nem comentários antes). */
  from: number;
  /** Fim exclusivo, antes do `;` que encerra a instrução. */
  to: number;
}

function trimEnd(doc: string, end: number) {
  while (/\s/.test(doc[end - 1])) end--;
  return end;
}

/**
 * Instruções de um script, separadas por `;` fora de strings, identificadores entre aspas,
 * comentários (`--`, `/* *​/`) e blocos `$tag$…$tag$`. Trechos só de comentário não contam.
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
        // Aspas duplicadas dentro do literal são escape, não fechamento.
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
