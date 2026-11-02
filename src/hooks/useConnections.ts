import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Conn, TableInfo } from "../types";

/**
 * Saved connections, active connection and tables of the connected database.
 * `restoreId` is reconnected once at startup (silently skipped if it no longer exists or fails).
 */
export function useConnections(restoreId: number | null) {
  const [connections, setConnections] = useState<Conn[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [connecting, setConnecting] = useState(false);

  const reload = useCallback(async () => setConnections(await api.listConnections()), []);
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

  return { connections, activeId, tables, connecting, reload, connect, disconnect, remove, refreshTables };
}
