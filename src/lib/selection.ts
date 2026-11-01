/** Seleção retangular de células; os limites são inclusivos e normalizados (r1 <= r2, c1 <= c2). */
export interface Range {
  r1: number;
  c1: number;
  r2: number;
  c2: number;
}

export interface Cell {
  r: number;
  c: number;
}

const lo = Math.min;
const hi = Math.max;

export const cellRange = (a: Cell, b: Cell): Range => ({
  r1: lo(a.r, b.r), r2: hi(a.r, b.r), c1: lo(a.c, b.c), c2: hi(a.c, b.c),
});

/** Linhas inteiras entre `a` e `b`. */
export const rowRange = (a: number, b: number, lastCol: number): Range => ({
  r1: lo(a, b), r2: hi(a, b), c1: 0, c2: lastCol,
});

/** Colunas inteiras entre `a` e `b`. */
export const colRange = (a: number, b: number, lastRow: number): Range => ({
  r1: 0, r2: lastRow, c1: lo(a, b), c2: hi(a, b),
});

export const contains = (ranges: Range[], r: number, c: number) =>
  ranges.some((g) => r >= g.r1 && r <= g.r2 && c >= g.c1 && c <= g.c2);

const span = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Linhas tocadas por alguma seleção, em ordem. */
export const rowsOf = (ranges: Range[]): number[] =>
  [...new Set(ranges.flatMap((g) => span(g.r1, g.r2)))].sort((a, b) => a - b);

/** Colunas tocadas por alguma seleção, em ordem. */
export const colsOf = (ranges: Range[]): number[] =>
  [...new Set(ranges.flatMap((g) => span(g.c1, g.c2)))].sort((a, b) => a - b);
