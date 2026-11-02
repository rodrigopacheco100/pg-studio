import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { EXPORT_FORMATS } from "../lib/exportResult";
import { useDialogs } from "../hooks/useDialogs";
import { errText } from "../api";
import { isActive, nextSort, NO_VIEW, type GridView } from "../lib/gridView";
import { FilterBar } from "./FilterBar";
import { toCsv, toInsert, toJson, toTsv, type Row } from "../lib/rowFormat";
import {
  cellRange, colRange, colsOf, contains, rowRange, rowsOf,
  type Cell, type Range,
} from "../lib/selection";
import type { ExportFormat, QueryResult, TableRef } from "../types";
import { JsonDialog } from "./JsonDialog";

const EDGE = 28; // distance from the edge that triggers autoscroll while dragging
const STEP = 24;

/** The drag started on a cell, on a row number or on a column header. */
type Mode = "cell" | "row" | "col";
interface Drag {
  mode: Mode;
  anchor: Cell;
}

type MenuItem = { separator: true } | { label: string; onSelect: () => void } | { label: string; items: MenuItem[] };

interface MenuState {
  /** Cell under the cursor. */
  cell: Cell;
  /** Target rows and columns of the actions (the selection, or just the clicked cell). */
  rows: number[];
  cols: number[];
}

interface Props {
  result: QueryResult;
  /** When the result is the contents of a table, enables "Copy as INSERT". */
  table?: TableRef;
  /** Sort and filters of the result; the owner applies them to `result` (it already comes sorted and filtered). */
  view: GridView;
  onViewChange: (view: GridView) => void;
  /** Starts exporting every row of the result (not just the page); the progress shows in its own window. */
  onExport: (format: ExportFormat) => Promise<void>;
}

/** Reads the position (row/column) of a grid element; undefined outside it. */
function locate(root: HTMLElement | null, el: Element | null) {
  const inside = (e: HTMLElement | null | undefined) => (e && root?.contains(e) ? e : undefined);
  const r = inside(el?.closest<HTMLElement>("[data-r]"))?.dataset.r;
  const c = inside(el?.closest<HTMLElement>("[data-c]"))?.dataset.c;
  return { r: r === undefined ? undefined : Number(r), c: c === undefined ? undefined : Number(c) };
}

interface GridRowProps {
  row: Row;
  r: number;
  /** Selected column ranges in this row ("0-2,5-5"); empty if none. */
  sig: string;
  fullRow: boolean;
  /** Column types of the result; boolean cells are shown in italics. */
  types: string[];
}

/** Memoized: dragging the selection only re-renders the rows whose selection changed. */
const GridRow = memo(function GridRow({ row, r, sig, fullRow, types }: GridRowProps) {
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
            (v === null || types[c] === "bool") && "italic",
            v === null && "text-muted-foreground",
            isSel(c) && "bg-primary/25",
          )}
        >
          {v === null ? "NULL" : v}
        </td>
      ))}
    </tr>
  );
});

function renderMenu(items: MenuItem[]): React.ReactNode {
  return items.map((item, i) =>
    "separator" in item ? (
      <ContextMenuSeparator key={i} />
    ) : "items" in item ? (
      <ContextMenuSub key={i}>
        <ContextMenuSubTrigger>{item.label}</ContextMenuSubTrigger>
        <ContextMenuSubContent>{renderMenu(item.items)}</ContextMenuSubContent>
      </ContextMenuSub>
    ) : (
      <ContextMenuItem key={i} onSelect={item.onSelect}>{item.label}</ContextMenuItem>
    ),
  );
}

/** Single results viewer: cell/row/column selection, drag and context menu. */
export function ResultViewer({ result, table, view, onViewChange, onExport }: Props) {
  const dialogs = useDialogs();
  const [filtering, setFiltering] = useState(false);
  const columnsKey = result.columns.join("\u0000");
  useEffect(() => setFiltering(false), [columnsKey]);

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

  // Drag: follows the mouse across the whole window and scrolls the results area near the edges.
  useEffect(() => {
    function apply() {
      const d = drag.current;
      if (!d) return;
      const { r, c } = locate(root.current, document.elementFromPoint(pointer.current.x, pointer.current.y));
      // Over the header (no row) or the row number (no column) only what the mode needs counts.
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
      flash(`${what} copied`);
    } catch {
      flash("Could not copy");
    }
  }

  function flash(message: string) {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(""), 2000);
  }

  async function exportAll(format: ExportFormat) {
    try {
      await onExport(format);
    } catch (e) {
      void dialogs.alert(`Could not start the export:\n${errText(e)}`);
    }
  }

  function selectAll() {
    if (shown > 0) setRanges([cellRange({ r: 0, c: 0 }, { r: lastRow, c: lastCol })]);
  }

  function onMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return;
    const el = e.target as Element;
    if (el.closest("[data-nodrag]")) return; // sort button and filter fields keep their own behavior
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

    e.preventDefault(); // no native text selection or browser drag
    root.current?.focus();
    pointer.current = { x: e.clientX, y: e.clientY };

    const from = e.shiftKey && anchor.current ? anchor.current : pos;
    if (!e.shiftKey) anchor.current = pos;
    const range = rangeFor(mode, from, pos);
    setRanges((prev) => (e.ctrlKey || e.metaKey ? [...prev, range] : [range]));
    drag.current = { mode, anchor: from };
  }

  // Radix opens the menu at the cursor position; here we only decide the selection and the action target.
  function onContextMenu(e: React.MouseEvent) {
    if ((e.target as Element).closest("[data-nodrag]")) return; // the field's own menu
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
      cell = { r: 0, c: 0 }; // grid corner: everything
      select(cellRange(cell, { r: lastRow, c: lastCol }));
    } else if (r === undefined) {
      cell = { r: 0, c: c! }; // header: the column
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

  /** Exportable data: the rows and columns crossed by the selection. */
  function project(rows: number[], cols: number[]) {
    return {
      names: cols.map((c) => result.columns[c]),
      types: cols.map((c) => result.types[c]),
      data: rows.map((r) => cols.map((c) => result.rows[r][c])) as Row[],
    };
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.target !== e.currentTarget) return; // keys from menus and dialogs do not belong to the grid
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "a") {
      e.preventDefault();
      selectAll();
    } else if (mod && e.key === "c" && selRows.length > 0) {
      e.preventDefault();
      const { names, data } = project(selRows, selCols);
      void copy(toTsv(names, data, false), "Selection");
    } else if (e.key === "Escape") {
      setRanges([]);
    }
  }

  function menuItems(m: MenuState): MenuItem[] {
    const { names, types, data } = project(m.rows, m.cols);
    const lines = data.length === 1 ? "1 row" : `${data.length} rows`;
    const partial = names.length < result.columns.length;
    const size = `${lines} × ${names.length} cols.`;
    const allColumns = (rows: number[]) => rows.map((r) => result.rows[r]);
    const cell = result.rows[m.cell.r]?.[m.cell.c] ?? null;
    return [
      // Whole rows, without having to select all the columns.
      { label: `View ${lines} as JSON`, onSelect: () => setJson(toJson(result.columns, allColumns(m.rows), result.types)) },
      ...(partial
        ? [{ label: `View selection (${size}) as JSON`, onSelect: () => setJson(toJson(names, data, types)) }]
        : []),
      { separator: true },
      {
        label: "Copy",
        items: [
          { label: "Cell value", onSelect: () => copy(cell ?? "NULL", "Value") },
          {
            label: names.length > 1 ? "Column names" : "Column name",
            onSelect: () => copy(names.join(", "), "Name"),
          },
        ],
      },
      {
        label: "Copy as",
        items: [
          { label: "JSON", onSelect: () => copy(toJson(names, data, types), "JSON") },
          { label: "CSV", onSelect: () => copy(toCsv(names, data), "CSV") },
          { label: "TSV", onSelect: () => copy(toTsv(names, data), "TSV") },
          ...(table ? [{ label: "INSERT", onSelect: () => copy(toInsert(table, names, data), "INSERT") }] : []),
        ],
      },
      {
        label: "Export all rows",
        items: EXPORT_FORMATS.filter((f) => f.id !== "insert" || table).map((f) => ({ label: f.label, onSelect: () => void exportAll(f.id) })),
      },
      { separator: true },
      { label: "Select all", onSelect: selectAll },
    ];
  }

  // Per row: selected column ranges and whether the whole row is selected.
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
    return <div className="msg">OK — {result.affected ?? 0} row(s) affected.</div>;
  }

  return (
    <div className="outline-none" tabIndex={0} ref={root} onKeyDown={onKeyDown}>
      <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
        <button
          type="button"
          aria-pressed={filtering}
          className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent", filtering && "bg-accent text-foreground")}
          onClick={() => setFiltering((f) => !f)}
        >
          <ListFilter className="size-3" /> Filter
        </button>
        {isActive(view) && (
          <button
            type="button"
            className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent"
            onClick={() => onViewChange(NO_VIEW)}
          >
            <X className="size-3" /> Clear sort and filters
          </button>
        )}
      </div>
      {filtering && <FilterBar result={result} applied={view.filters} onSearch={(filters) => onViewChange({ ...view, filters })} />}
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
                  title="Select all"
                />
                {result.columns.map((c, i) => {
                  const sorted = view.sort?.column === i ? view.sort : null;
                  const SortIcon = sorted ? (sorted.desc ? ArrowDown : ArrowUp) : ArrowUpDown;
                  return (
                    <th
                      key={i}
                      data-c={i}
                      className={cn(
                        "sticky top-0 z-10 cursor-pointer border-r border-b bg-muted px-3 py-1.5 text-left font-medium",
                        fullCols.has(i) && "bg-primary/30",
                      )}
                    >
                      <div className="flex items-center gap-1.5">
                        {c}
                        <button
                          type="button"
                          data-nodrag
                          title={sorted ? (sorted.desc ? "Sorted descending (click to remove)" : "Sorted ascending (click for descending)") : "Sort"}
                          aria-label={`Sort by ${c}`}
                          className={cn("rounded p-0.5 hover:bg-accent", sorted ? "text-primary" : "text-muted-foreground opacity-60")}
                          onClick={() => onViewChange({ ...view, sort: nextSort(view.sort, i) })}
                        >
                          <SortIcon className="size-3" />
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {result.rows.slice(0, shown).map((row, r) => (
                <GridRow key={r} row={row} r={r} sig={rowSel[r].sig} fullRow={rowSel[r].full} types={result.types} />
              ))}
            </tbody>
          </table>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          {menu && renderMenu(menuItems(menu))}
        </ContextMenuContent>
      </ContextMenu>
      {shown === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No rows.</div>}
      {(selRows.length > 0 || notice) && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">
          {selRows.length > 0 && `${selRows.length} row(s) × ${selCols.length} column(s) selected`}
          {notice && <strong className="font-medium text-primary">{selRows.length > 0 ? " · " : ""}{notice}</strong>}
        </div>
      )}

      {json !== null && (
        <JsonDialog title="JSON" json={json} onCopy={() => copy(json, "JSON")} onClose={() => setJson(null)} />
      )}
    </div>
  );
}
