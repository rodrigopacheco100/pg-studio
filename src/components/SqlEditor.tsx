import { autocompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { PostgreSQL, sql } from "@codemirror/lang-sql";
import { Prec } from "@codemirror/state";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView, keymap } from "@codemirror/view";
import { basicSetup } from "codemirror";
import { useEffect, useImperativeHandle, useRef } from "react";
import { runGutter } from "./runGutter";
import { createSqlCompletion } from "../lib/sqlComplete";
import type { TableInfo } from "../types";

export interface SqlEditorHandle {
  /** A seleção, ou o texto inteiro se nada estiver selecionado. */
  getRunText: () => string;
}

interface Props {
  ref?: React.Ref<SqlEditorHandle>;
  value: string;
  tables: TableInfo[];
  onChange: (value: string) => void;
  /** Executa `sql`: o texto da seleção/documento (Ctrl+Enter) ou uma instrução (botão ▶). */
  onRun: (sql: string) => void;
}

/** Usa as variáveis de cor do shadcn; o `oneDark` fornece o realce de sintaxe. */
const theme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "var(--background)", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-gutters": { backgroundColor: "var(--background)", color: "var(--muted-foreground)", border: "none" },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "color-mix(in oklch, var(--muted) 50%, transparent)" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: "13px" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius-md)",
  },
  ".cm-tooltip-autocomplete ul li[aria-selected]": {
    backgroundColor: "var(--accent)",
    color: "var(--accent-foreground)",
  },
});

function getRunText(v: EditorView) {
  const s = v.state;
  const { from, to } = s.selection.main;
  return (from === to ? s.doc.toString() : s.sliceDoc(from, to)).trim();
}

export function SqlEditor({ ref, value, tables, onChange, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  // Os callbacks e as tabelas mudam sem recriar o editor.
  const latest = useRef({ onChange, onRun, tables });
  latest.current = { onChange, onRun, tables };

  useImperativeHandle(ref, () => ({ getRunText: () => getRunText(view.current!) }));

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      doc: value,
      extensions: [
        Prec.highest(
          keymap.of([
            { key: "Mod-Enter", run: (target) => (latest.current.onRun(getRunText(target)), true) },
            indentWithTab,
          ]),
        ),
        runGutter((sql) => latest.current.onRun(sql)),
        basicSetup,
        sql({ dialect: PostgreSQL }),
        oneDark,
        theme,
        autocompletion({ override: [createSqlCompletion(() => latest.current.tables)] }),
        EditorView.updateListener.of((u) => u.docChanged && latest.current.onChange(u.state.doc.toString())),
      ],
    });
    view.current = v;
    return () => v.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- o editor é criado uma vez; `value` é sincronizado abaixo
  }, []);

  // Mudanças externas (ex.: usar uma query do histórico).
  useEffect(() => {
    const v = view.current;
    if (v && v.state.doc.toString() !== value) {
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div className="min-h-0 flex-1 overflow-hidden [&_.cm-editor]:h-full" ref={host} />;
}
