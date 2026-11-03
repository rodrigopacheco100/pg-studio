import { AlignLeft, Play, Save, SaveAll, Square } from "lucide-react";
import { useEffect, useImperativeHandle, useRef } from "react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { ResizeHandle } from "@/components/ResizeHandle";
import { ResultsPane } from "@/features/results/ResultsPane";
import { useResults, type Paging } from "@/features/results/useResults";
import { useSettings } from "@/features/settings/useSettings";
import { useDialogs } from "@/hooks/useDialogs";
import type { RunInfo, TableRef } from "@/types";
import { destructiveStatements } from "./destructive";
import { SqlEditor, type SqlEditorHandle } from "./SqlEditor";
import type { Doc } from "./useDocuments";
import type { TableInfo } from "@/types";

/** What the status bar shows for the active tab. */
export interface TabStatus {
  info: RunInfo | null;
  paging: Paging | null;
  onPage: (page: number) => void;
}

/** Commands of one tab that the app menu and the sidebar can trigger. */
export interface DocPaneHandle {
  run: () => void;
  runAtCursor: () => void;
  format: () => void;
  saveQuery: () => Promise<void>;
  focus: () => void;
  /** Shows a table's first page in this tab's results (the SQL in the editor is set by the caller). */
  openTable: (table: TableRef) => void;
  /** Runs generated SQL (no destructive check) and shows its results. */
  runSql: (sql: string) => void;
  reset: () => void;
}

interface Props {
  ref: React.Ref<DocPaneHandle>;
  doc: Doc;
  tables: TableInfo[];
  /** The tab on screen: it reports its status and takes the focus. */
  active: boolean;
  onChange: (sql: string) => void;
  onStatus: (status: TabStatus) => void;
  onSaveFile: () => void;
  /** Opens a query in a new tab and runs it. */
  onOpenSql: (sql: string) => void;
}

/** One tab: its SQL editor and, below it, its own results. Stays mounted while hidden to keep cursor, undo and results. */
export function DocPane({ ref, doc, tables, active, onChange, onStatus, onSaveFile, onOpenSql }: Props) {
  const results = useResults();
  const editor = useRef<SqlEditorHandle>(null);
  const { settings, update } = useSettings();
  const dialogs = useDialogs();

  async function run(text: string) {
    if (!text) return;
    const risky = settings.confirmDestructive ? destructiveStatements(text) : [];
    if (risky.length > 0) {
      const shown = risky.slice(0, 5).map((d) => `• ${d.reason}: ${d.sql}`);
      if (risky.length > shown.length) shown.push(`…and ${risky.length - shown.length} more`);
      const ok = await dialogs.confirm(shown.join("\n"), { title: "Run destructive statements?", confirmLabel: "Run" });
      if (!ok) return;
    }
    void results.runQuery(text);
  }

  async function saveQuery() {
    if (!doc.sql.trim()) return;
    const name = await dialogs.prompt("Query name:", "Save query");
    if (name) await api.saveQuery({ id: null, name, sql: doc.sql });
  }

  useImperativeHandle(ref, () => ({
    run: () => run(editor.current?.getRunText() ?? ""),
    runAtCursor: () => run(editor.current?.getCursorStatement() ?? ""),
    format: () => editor.current?.format(),
    saveQuery,
    focus: () => editor.current?.focus(),
    openTable: (table) => void results.openTable(table),
    runSql: (sql) => void results.runQuery(sql),
    reset: results.reset,
  }));

  const { info, paging, goToPage } = results;
  useEffect(() => {
    if (active) onStatus({ info, paging, onPage: goToPage });
  }, [active, info, paging, goToPage, onStatus]);

  return (
    <div className="min-h-0 flex-1 flex-col" style={{ display: active ? "flex" : "none" }}>
      <div className="relative flex max-h-[80%] min-h-32 shrink-0 flex-col border-b" style={{ height: settings.editorHeight }}>
        <ResizeHandle axis="y" size={settings.editorHeight} min={128} onChange={(editorHeight) => update({ editorHeight })} />
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
          {results.outcome?.kind === "running" ? (
            <Button size="sm" variant="destructive" onClick={() => void api.cancelQuery()} title="Cancel the running query"><Square /> Stop</Button>
          ) : (
            <Button size="sm" onClick={() => run(editor.current?.getRunText() ?? "")}><Play /> Run</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => editor.current?.format()} title="Format the SQL in this tab (Ctrl+Shift+F)"><AlignLeft /> Beautify</Button>
          <Button size="sm" variant="outline" onClick={onSaveFile} title="Save file (Ctrl+S)"><SaveAll /> Save file</Button>
          <Button size="sm" variant="outline" onClick={saveQuery} title="Keep this query in the Saved tab"><Save /> Save query</Button>
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Enter runs all · Ctrl+Shift+Enter runs the query at the cursor · Ctrl+Space autocompletes</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <SqlEditor ref={editor} value={doc.sql} tables={tables} onChange={onChange} onRun={run} />
        </div>
      </div>
      <ResultsPane results={results} onOpenSql={onOpenSql} />
    </div>
  );
}
