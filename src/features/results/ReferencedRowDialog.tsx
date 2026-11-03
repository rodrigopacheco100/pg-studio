import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errText } from "@/api";
import { quoteIdent, quoteLiteral } from "@/features/editor/sql";
import { useSettings } from "@/features/settings/useSettings";
import type { FkTarget, QueryResult } from "@/types";
import { kindOf } from "./gridFilter";
import { NO_VIEW } from "./gridView";
import type { Row } from "./rowFormat";
import { ResultViewer } from "./ResultViewer";

/** One foreign key followed: the key, the row it was followed from and that result's column types. */
export interface FkStep {
  target: FkTarget;
  row: Row;
  types: string[];
}

interface Props {
  first: FkStep;
  onOpenSql?: (name: string, sql: string) => void;
  onClose: () => void;
}

type State = { result: QueryResult } | { error: string } | null;

/**
 * The rows a foreign key points to: the referenced table where each referenced column equals the row's value.
 * Following a key inside it replaces the content (one dialog, however deep) and Back returns along the trail.
 */
export function ReferencedRowDialog({ first, onOpenSql, onClose }: Props) {
  const pageSize = useSettings().settings.pageSize;
  /** Every key followed so far and which one is on screen; going back keeps the steps ahead for Forward. */
  const [trail, setTrail] = useState({ steps: [first], at: 0 });
  const { target, row, types } = trail.steps[trail.at];
  const [state, setState] = useState<State>(null);
  const follow = useCallback((step: FkStep) => setTrail((t) => ({ steps: [...t.steps.slice(0, t.at + 1), step], at: t.at + 1 })), []);
  const go = useCallback((by: -1 | 1) => setTrail((t) => (t.steps[t.at + by] ? { ...t, at: t.at + by } : t)), []);

  // The mouse's back / forward buttons (3 and 4) walk the trail, as in a browser.
  useEffect(() => {
    const walk = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.type === "mouseup") go(e.button === 3 ? -1 : 1);
    };
    window.addEventListener("mousedown", walk);
    window.addEventListener("mouseup", walk);
    return () => {
      window.removeEventListener("mousedown", walk);
      window.removeEventListener("mouseup", walk);
    };
  }, [go]);

  useEffect(() => {
    let current = true;
    setState(null);
    const filters = target.columns.map(({ index, column }) => {
      const value = row[index];
      return value === null
        ? { column, op: "is_null", value: "", numeric: false }
        : { column, op: "eq", value, numeric: kindOf(types[index]) === "number" };
    });
    api.tableData(target.schema, target.table, pageSize, 0, { sort: null, filters })
      .then((result) => current && setState({ result }))
      .catch((e) => current && setState({ error: errText(e) }));
    return () => { current = false; };
  }, [target, row, types, pageSize]);

  const where = target.columns
    .map(({ index, column }) => `${quoteIdent(column)} ${row[index] === null ? "IS NULL" : `= ${quoteLiteral(row[index])}`}`)
    .join(" AND ");
  const sql = `SELECT * FROM ${quoteIdent(target.schema)}.${quoteIdent(target.table)} WHERE ${where};`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{target.schema}.{target.table}</DialogTitle>
          <DialogDescription>{where.replaceAll('"', "")}</DialogDescription>
        </DialogHeader>
        <div className="min-h-24 overflow-auto rounded-md border border-foreground/25 bg-background [&_td:last-child]:border-r-0 [&_th:last-child]:border-r-0 [&_tbody_tr:last-child_td]:border-b-0">
          {!state && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
          {state && "error" in state && <div className="selectable p-3 text-sm whitespace-pre-wrap text-destructive">{state.error}</div>}
          {state && "result" in state && (
            <ResultViewer result={state.result} table={{ schema: target.schema, name: target.table }} view={NO_VIEW} onOpenSql={onOpenSql} onFollow={follow} />
          )}
        </div>
        <DialogFooter>
          <div className="flex gap-1 sm:mr-auto">
            <Button variant="outline" disabled={trail.at === 0} onClick={() => go(-1)} title="Back (mouse back button)"><ArrowLeft /> Back</Button>
            <Button variant="outline" disabled={trail.at === trail.steps.length - 1} onClick={() => go(1)} title="Forward (mouse forward button)">Forward <ArrowRight /></Button>
          </div>
          {onOpenSql && <Button variant="outline" onClick={() => { onOpenSql(target.table, sql); onClose(); }}>Open in new tab</Button>}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
