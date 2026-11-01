import { Play, Save } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { api } from "../api";
import { ResizeHandle } from "../components/ResizeHandle";
import { ResultsPane } from "../components/ResultsPane";
import { SqlEditor, type SqlEditorHandle } from "../components/SqlEditor";
import { useSettings } from "../hooks/useSettings";
import type { ResultsApi } from "../hooks/useResults";
import type { TableInfo } from "../types";

interface Props {
  sql: string;
  tables: TableInfo[];
  onSqlChange: (sql: string) => void;
  results: ResultsApi;
}

/** Editor de query sobre o painel de resultados compartilhado. */
export function QueryView({ sql, tables, onSqlChange, results }: Props) {
  const editor = useRef<SqlEditorHandle>(null);
  const { settings, update } = useSettings();

  function run() {
    const text = editor.current?.getRunText();
    if (text) void results.runQuery(text);
  }

  async function save() {
    if (!sql.trim()) return;
    const name = prompt("Nome da query:");
    if (name) await api.saveQuery({ id: null, name, sql });
  }

  return (
    <>
      <div className="relative flex max-h-[80%] min-h-32 shrink-0 flex-col border-b" style={{ height: settings.editorHeight }}>
        <ResizeHandle axis="y" size={settings.editorHeight} min={128} onChange={(editorHeight) => update({ editorHeight })} />
        <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
          <Button size="sm" onClick={run}><Play /> Executar</Button>
          <Button size="sm" variant="outline" onClick={save}><Save /> Salvar query</Button>
          <span className="ml-auto text-xs text-muted-foreground">Ctrl+Enter executa · Ctrl+Espaço autocompleta</span>
        </div>
        <SqlEditor ref={editor} value={sql} tables={tables} onChange={onSqlChange} onRun={run} />
      </div>
      <ResultsPane results={results} />
    </>
  );
}
