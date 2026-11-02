import { useCallback, useEffect, useRef, useState } from "react";
import { errText, files } from "../api";
import { useDialogs } from "./useDialogs";
import { useSession } from "./useSession";

export interface Doc {
  id: number;
  /** File on disk; `null` for a document that was never saved. */
  path: string | null;
  name: string;
  sql: string;
  /** Content as last read from or written to disk (`""` for a new document). */
  saved: string;
}

export const isDirty = (d: Doc) => d.sql !== d.saved;

const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** The SQL documents open in the editor (files and unsaved scratch tabs). There is always at least one. */
export function useDocuments() {
  const session = useSession();
  const dialogs = useDialogs();
  const restored = session.initial.docs;
  const nextId = useRef(Math.max(0, ...restored.map((d) => d.id)) + 1);
  const untitled = useRef(Math.max(0, ...restored.map((d) => Number(/^Untitled-(\d+)$/.exec(d.name)?.[1] ?? 0))));
  const blank = (sql = ""): Doc => ({ id: nextId.current++, path: null, name: `Untitled-${++untitled.current}`, sql, saved: "" });

  const [docs, setDocs] = useState<Doc[]>(() => (restored.length > 0 ? restored : [blank()]));
  const [activeId, setActiveId] = useState(() => session.initial.activeDoc ?? docs[0].id);
  // Handlers read the latest list without being recreated on every keystroke.
  const latest = useRef(docs);
  latest.current = docs;

  const patch = useCallback((id: number, changes: Partial<Doc>) => {
    setDocs((all) => all.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  }, []);

  const create = useCallback((sql = "") => {
    const doc = blank(sql);
    setDocs((all) => [...all, doc]);
    setActiveId(doc.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `blank` only touches refs
  }, []);

  const change = useCallback((id: number, sql: string) => patch(id, { sql }), [patch]);

  const open = useCallback(async () => {
    try {
      for (const path of await files.pickToOpen()) {
        const existing = latest.current.find((d) => d.path === path);
        if (existing) {
          setActiveId(existing.id);
          continue;
        }
        const sql = await files.read(path);
        const doc: Doc = { id: nextId.current++, path, name: baseName(path), sql, saved: sql };
        // A lone, untouched scratch tab is replaced instead of being left behind empty.
        setDocs((all) => (all.length === 1 && all[0].path === null && all[0].sql === "" ? [doc] : [...all, doc]));
        setActiveId(doc.id);
      }
    } catch (e) {
      void dialogs.alert(`Failed to open file:\n${errText(e)}`);
    }
  }, [dialogs]);

  const save = useCallback(async (id: number, asNew = false) => {
    const doc = latest.current.find((d) => d.id === id);
    if (!doc) return;
    try {
      const path = asNew || !doc.path ? await files.pickToSave(doc.path ?? `${doc.name}.sql`) : doc.path;
      if (!path) return;
      const content = doc.sql;
      await files.write(path, content);
      patch(id, { path, name: baseName(path), saved: content });
    } catch (e) {
      void dialogs.alert(`Failed to save file:\n${errText(e)}`);
    }
  }, [patch, dialogs]);

  const close = useCallback(async (id: number) => {
    const doc = latest.current.find((d) => d.id === id);
    if (!doc) return;
    if (isDirty(doc) && !(await dialogs.confirm(`Discard unsaved changes to ${doc.name}?`, { title: "Unsaved changes", confirmLabel: "Discard" }))) return;
    const rest = latest.current.filter((d) => d.id !== id);
    if (rest.length === 0) {
      const fresh = blank();
      setDocs([fresh]);
      setActiveId(fresh.id);
      return;
    }
    setDocs(rest);
    setActiveId((current) => {
      if (current !== id) return current;
      const index = latest.current.findIndex((d) => d.id === id);
      return rest[Math.min(index, rest.length - 1)].id;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `blank` only touches refs
  }, [dialogs]);

  useEffect(() => {
    session.update({ docs, activeDoc: activeId });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `update` is stable enough; persist on state change only
  }, [docs, activeId]);

  const active = docs.find((d) => d.id === activeId) ?? docs[0];
  return { docs, active, select: setActiveId, create, change, open, save, close };
}

export type DocumentsApi = ReturnType<typeof useDocuments>;
