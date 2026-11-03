import { useEffect, useState } from "react";
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

interface Props {
  /** The foreign key followed and the row of the result it was followed from. */
  target: FkTarget;
  row: Row;
  /** Column types of the result the row comes from. */
  types: string[];
  onOpenSql?: (sql: string) => void;
  onClose: () => void;
}

type State = { result: QueryResult } | { error: string } | null;

/** The rows a foreign key points to: the referenced table where each referenced column equals the row's value. */
export function ReferencedRowDialog({ target, row, types, onOpenSql, onClose }: Props) {
  const pageSize = useSettings().settings.pageSize;
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let current = true;
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
            <ResultViewer result={state.result} table={{ schema: target.schema, name: target.table }} view={NO_VIEW} onOpenSql={onOpenSql} />
          )}
        </div>
        <DialogFooter>
          {onOpenSql && <Button variant="outline" onClick={() => { onOpenSql(sql); onClose(); }}>Open in new tab</Button>}
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
