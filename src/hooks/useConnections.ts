import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { moveConnection, moveFolder } from "../lib/connectionOrder";
import type { Conn, Folder, TableInfo } from "../types";

/**
 * Saved connections, active connection and tables of the connected database.
 * `restoreId` is reconnected once at startup (silently skipped if it no longer exists or fails).
 */
export function useConnections(restoreId: number | null) {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [connecting, setConnecting] = useState(false);

  const reload = useCallback(async () => {
    const [conns, fs] = await Promise.all([api.listConnections(), api.listFolders()]);
    setConnections(conns);
    setFolders(fs);
  }, []);
  useEffect(() => void reload(), [reload]);

  const disconnect = useCallback(async () => {
    await api.disconnect();
    setActiveId(null);
    setTables([]);
  }, []);

  /** Throws if the connection fails. */
  const connect = useCallback(async (id: number) => {
    setConnecting(true);
    try {
      setTables(await api.connect(id));
      setActiveId(id);
    } finally {
      setConnecting(false);
    }
  }, []);

  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || restoreId === null) return;
    restored.current = true;
    connect(restoreId).catch((e) => console.error("Could not restore the last connection:", e));
  }, [restoreId, connect]);

  const remove = useCallback(
    async (id: number) => {
      if (id === activeId) await disconnect();
      await api.deleteConnection(id);
      await reload();
    },
    [activeId, disconnect, reload],
  );

  const refreshTables = useCallback(async () => setTables(await api.refreshTables()), []);

  /** Applies the new order right away and persists it; on failure the stored order is reloaded. */
  const persistOrder = useCallback((save: Promise<void>) => save.catch((e) => { console.error(e); return reload(); }), [reload]);

  const move = useCallback(
    (id: number, folderId: number | null, beforeId: number | null) => {
      const next = moveConnection(connections, id, folderId, beforeId);
      if (next === connections) return;
      setConnections(next);
      void persistOrder(api.reorderConnections(next.map((c) => ({ id: c.id!, folder_id: c.folder_id }))));
    },
    [connections, persistOrder],
  );

  const moveFolderBefore = useCallback(
    (id: number, beforeId: number | null) => {
      const next = moveFolder(folders, id, beforeId);
      if (next === folders) return;
      setFolders(next);
      void persistOrder(api.reorderFolders(next.map((f) => f.id)));
    },
    [folders, persistOrder],
  );

  const createFolder = useCallback(async (name: string) => { await api.createFolder(name); await reload(); }, [reload]);
  const renameFolder = useCallback(async (id: number, name: string) => { await api.renameFolder(id, name); await reload(); }, [reload]);
  const deleteFolder = useCallback(async (id: number) => { await api.deleteFolder(id); await reload(); }, [reload]);

  return { connections, folders, move, moveFolder: moveFolderBefore, createFolder, renameFolder, deleteFolder, activeId, tables, connecting, reload, connect, disconnect, remove, refreshTables };
}
