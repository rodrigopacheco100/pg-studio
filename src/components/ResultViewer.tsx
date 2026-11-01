import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { toCsv, toInsert, toJson, toTsv, type Row } from "../lib/rowFormat";
import {
  cellRange, colRange, colsOf, contains, rowRange, rowsOf,
  type Cell, type Range,
} from "../lib/selection";
import type { QueryResult, TableRef } from "../types";
import { JsonDialog } from "./JsonDialog";

const EDGE = 28; // distância da borda que ativa o autoscroll durante o arraste
const STEP = 24;

/** O arraste começou numa célula, no número de uma linha ou no cabeçalho de uma coluna. */
type Mode = "cell" | "row" | "col";
interface Drag {
  mode: Mode;
  anchor: Cell;
}

type MenuItem = { separator: true } | { label: string; onSelect: () => void };

interface MenuState {
  /** Célula sob o cursor. */
  cell: Cell;
  /** Linhas e colunas alvo das ações (a seleção, ou só a célula clicada). */
  rows: number[];
  cols: number[];
}

interface Props {
  result: QueryResult;
  /** Quando o resultado é o conteúdo de uma tabela, habilita "Copiar como INSERT". */
  table?: TableRef;
}

/** Lê a posição (linha/coluna) de um elemento da grade; indefinida fora dela. */
function locate(root: HTMLElement | null, el: Element | null) {
  const inside = (e: HTMLElement | null | undefined) => (e && root?.contains(e) ? e : undefined);
  const r = inside(el?.closest<HTMLElement>("[data-r]"))?.dataset.r;
  const c = inside(el?.closest<HTMLElement>("[data-c]"))?.dataset.c;
  return { r: r === undefined ? undefined : Number(r), c: c === undefined ? undefined : Number(c) };
}

interface GridRowProps {
  row: Row;
  r: number;
  /** Faixas de colunas selecionadas nesta linha ("0-2,5-5"); vazio se nenhuma. */
  sig: string;
  fullRow: boolean;
}

/** Memoizada: arrastar a seleção só renderiza de novo as linhas cuja seleção mudou. */
const GridRow = memo(function GridRow({ row, r, sig, fullRow }: GridRowProps) {
  const segs = sig ? sig.split(",").map((s) => s.split("-").map(Number)) : [];
  const isSel = (c: number) => segs.some(([a, b]) => c >= a && c <= b);
  return (
    <tr>
      <td
        data-r={r}
        className={cn(
          "sticky left-0 z-10 w-11 min-w-11 cursor-pointer border-r border-b bg-muted px-2 py-1 text-right text-muted-foreground",
          fullRow && "bg-primary/40 text-foreground",
        )}
      >
        {r + 1}
      </td>
      {row.map((v, c) => (
        <td
          key={c}
          data-r={r}
          data-c={c}
          title={v ?? undefined}
          className={cn(
            "max-w-105 truncate border-r border-b px-3 py-1 whitespace-nowrap",
            v === null && "text-muted-foreground italic",
            isSel(c) && "bg-primary/25",
          )}
        >
          {v === null ? "NULL" : v}
        </td>
      ))}
    </tr>
  );
});

/** Visualizador de resultados único: seleção por célula/linha/coluna, arraste e menu de contexto. */
export function ResultViewer({ result, table }: Props) {
  const [ranges, setRanges] = useState<Range[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const anchor = useRef<Cell | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const noticeTimer = useRef<number>(undefined);

  const shown = result.rows.length;
  const lastRow = shown - 1;
  const lastCol = result.columns.length - 1;
  const dims = useRef({ lastRow, lastCol });
  dims.current = { lastRow, lastCol };

  useEffect(() => {
    setRanges([]);
    setMenu(null);
    anchor.current = null;
  }, [result]);

  const rangeFor = (mode: Mode, from: Cell, to: Cell): Range => {
    const d = dims.current;
    if (mode === "row") return rowRange(from.r, to.r, d.lastCol);
    if (mode === "col") return colRange(from.c, to.c, d.lastRow);
    return cellRange(from, to);
  };

  // Arraste: acompanha o mouse pela janela toda e rola a área de resultados perto das bordas.
  useEffect(() => {
    function apply() {
      const d = drag.current;
      if (!d) return;
      const { r, c } = locate(root.current, document.elementFromPoint(pointer.current.x, pointer.current.y));
      // Sobre o cabeçalho (sem linha) ou o número da linha (sem coluna) só vale o que o modo precisa.
      let pos: Cell;
      if (d.mode === "cell") {
        if (r === undefined) return;
        pos = { r, c: c ?? 0 };
      } else if (d.mode === "row") {
        if (r === undefined) return;
        pos = { r, c: 0 };
      } else {
        if (c === undefined) return;
        pos = { r: 0, c };
      }
      const range = rangeFor(d.mode, d.anchor, pos);
      setRanges((prev) => [...prev.slice(0, -1), range]);
    }

    function autoscroll() {
      if (!drag.current) return;
      const area = root.current?.closest<HTMLElement>(".results");
      if (area) {
        const b = area.getBoundingClientRect();
        const { x, y } = pointer.current;
        if (y < b.top + EDGE) area.scrollTop -= STEP;
        else if (y > b.bottom - EDGE) area.scrollTop += STEP;
        if (x < b.left + EDGE) area.scrollLeft -= STEP;
        else if (x > b.right - EDGE) area.scrollLeft += STEP;
      }
      apply();
    }

    const move = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY };
      apply();
    };
    const up = () => (drag.current = null);
    const timer = window.setInterval(autoscroll, 50);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice(`${what} copiado`);
    } catch {
      setNotice("Não foi possível copiar");
    }
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2000);
  }

  function selectAll() {
    if (shown > 0) setRanges([cellRange({ r: 0, c: 0 }, { r: lastRow, c: lastCol })]);
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const el = e.target as Element;
    if (el.closest("th.corner")) {
      selectAll();
      return;
    }
    const { r, c } = locate(root.current, el);
    let mode: Mode;
    let pos: Cell;
    if (r !== undefined && c !== undefined) [mode, pos] = ["cell", { r, c }];
    else if (r !== undefined) [mode, pos] = ["row", { r, c: 0 }];
    else if (c !== undefined) [mode, pos] = ["col", { r: 0, c }];
    else return;

    e.preventDefault(); // sem seleção nativa de texto nem arraste do navegador
    root.current?.focus();
    pointer.current = { x: e.clientX, y: e.clientY };

    const from = e.shiftKey && anchor.current ? anchor.current : pos;
    if (!e.shiftKey) anchor.current = pos;
    const range = rangeFor(mode, from, pos);
    setRanges((prev) => (e.ctrlKey || e.metaKey ? [...prev, range] : [range]));
    drag.current = { mode, anchor: from };
  }

  // O Radix abre o menu na posição do cursor; aqui só se decide a seleção e o alvo das ações.
  function onContextMenu(e: React.MouseEvent) {
    if (shown === 0) {
      e.preventDefault();
      return;
    }
    const { r, c } = locate(root.current, e.target as Element);
    let cell: Cell;
    let target = ranges;
    const select = (range: Range) => {
      target = [range];
      setRanges(target);
      anchor.current = cell;
    };
    if (r === undefined && c === undefined) {
      cell = { r: 0, c: 0 }; // canto da grade: tudo
      select(cellRange(cell, { r: lastRow, c: lastCol }));
    } else if (r === undefined) {
      cell = { r: 0, c: c! }; // cabeçalho: a coluna
      if (!fullCols.has(c!)) select(colRange(c!, c!, lastRow));
    } else {
      cell = { r, c: c ?? 0 };
      const inside = c === undefined ? ranges.some((g) => r >= g.r1 && r <= g.r2) : contains(ranges, r, c);
      if (!inside) select(c === undefined ? rowRange(r, r, lastCol) : cellRange(cell, cell));
    }
    setMenu({ cell, rows: rowsOf(target), cols: colsOf(target) });
  }

  const selRows = useMemo(() => rowsOf(ranges), [ranges]);
  const selCols = useMemo(() => colsOf(ranges), [ranges]);

  /** Dados exportáveis: as linhas e colunas atravessadas pela seleção. */
  function project(rows: number[], cols: number[]) {
    return {
      names: cols.map((c) => result.columns[c]),
      data: rows.map((r) => cols.map((c) => result.rows[r][c])) as Row[],
    };
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget) return; // teclas de menus e diálogos não são da grade
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "a") {
      e.preventDefault();
      selectAll();
    } else if (mod && e.key === "c" && selRows.length > 0) {
      e.preventDefault();
      const { names, data } = project(selRows, selCols);
      void copy(toTsv(names, data, false), "Seleção");
    } else if (e.key === "Escape") {
      setRanges([]);
    }
  }

  function menuItems(m: MenuState): MenuItem[] {
    const { names, data } = project(m.rows, m.cols);
    const lines = data.length === 1 ? "1 linha" : `${data.length} linhas`;
    const partial = names.length < result.columns.length;
    const size = `${lines} × ${names.length} col.`;
    const allColumns = (rows: number[]) => rows.map((r) => result.rows[r]);
    const cell = result.rows[m.cell.r]?.[m.cell.c] ?? null;
    return [
      // Linhas inteiras, sem precisar selecionar todas as colunas.
      { label: `Ver ${lines} como JSON`, onSelect: () => setJson(toJson(result.columns, allColumns(m.rows))) },
      ...(partial
        ? [{ label: `Ver seleção (${size}) como JSON`, onSelect: () => setJson(toJson(names, data)) }]
        : []),
      { separator: true },
      { label: "Copiar como JSON", onSelect: () => copy(toJson(names, data), "JSON") },
      { label: "Copiar como CSV", onSelect: () => copy(toCsv(names, data), "CSV") },
      { label: "Copiar como TSV", onSelect: () => copy(toTsv(names, data), "TSV") },
      ...(table
        ? [{ label: "Copiar como INSERT", onSelect: () => copy(toInsert(table, names, data), "INSERT") }]
        : []),
      { separator: true },
      { label: "Copiar valor da célula", onSelect: () => copy(cell ?? "NULL", "Valor") },
      {
        label: names.length > 1 ? "Copiar nomes das colunas" : "Copiar nome da coluna",
        onSelect: () => copy(names.join(", "), "Nome"),
      },
      { separator: true },
      { label: "Selecionar tudo", onSelect: selectAll },
    ];
  }

  // Por linha: faixas de colunas selecionadas e se a linha inteira está selecionada.
  const rowSel = useMemo(() => {
    return Array.from({ length: shown }, (_, r) => {
      const hit = ranges.filter((g) => r >= g.r1 && r <= g.r2);
      return {
        sig: hit.map((g) => `${g.c1}-${g.c2}`).join(","),
        full: hit.some((g) => g.c1 === 0 && g.c2 === lastCol),
      };
    });
  }, [ranges, shown, lastCol]);

  const fullCols = useMemo(() => {
    const set = new Set<number>();
    for (const g of ranges) {
      if (g.r1 === 0 && g.r2 === lastRow) for (let c = g.c1; c <= g.c2; c++) set.add(c);
    }
    return set;
  }, [ranges, lastRow]);

  if (result.columns.length === 0) {
    return <div className="msg">OK — {result.affected ?? 0} linha(s) afetada(s).</div>;
  }

  return (
    <div className="outline-none" tabIndex={0} ref={root} onKeyDown={onKeyDown}>
      <ContextMenu onOpenChange={(open) => !open && setMenu(null)}>
        <ContextMenuTrigger asChild>
          <table
            className="w-max min-w-full border-separate border-spacing-0 font-mono text-xs"
            onMouseDown={onMouseDown}
            onContextMenu={onContextMenu}
          >
            <thead>
              <tr>
                <th
                  className="corner sticky top-0 left-0 z-20 w-11 min-w-11 cursor-pointer border-r border-b bg-muted"
                  title="Selecionar tudo"
                />
                {result.columns.map((c, i) => (
                  <th
                    key={i}
                    data-c={i}
                    className={cn(
                      "sticky top-0 z-10 cursor-pointer border-r border-b bg-muted px-3 py-1.5 text-left font-medium",
                      fullCols.has(i) && "bg-primary/30",
                    )}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, shown).map((row, r) => (
                <GridRow key={r} row={row} r={r} sig={rowSel[r].sig} fullRow={rowSel[r].full} />
              ))}
            </tbody>
          </table>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          {menu &&
            menuItems(menu).map((item, i) =>
              "separator" in item ? (
                <ContextMenuSeparator key={i} />
              ) : (
                <ContextMenuItem key={i} onSelect={item.onSelect}>{item.label}</ContextMenuItem>
              ),
            )}
        </ContextMenuContent>
      </ContextMenu>
      {shown === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma linha.</div>}
      {(selRows.length > 0 || notice) && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">
          {selRows.length > 0 && `${selRows.length} linha(s) × ${selCols.length} coluna(s) selecionada(s)`}
          {notice && <strong className="font-medium text-primary">{selRows.length > 0 ? " · " : ""}{notice}</strong>}
        </div>
      )}

      {json !== null && (
        <JsonDialog title="JSON" json={json} onCopy={() => copy(json, "JSON")} onClose={() => setJson(null)} />
      )}
    </div>
  );
}
