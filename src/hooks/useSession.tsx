import { createContext, useContext, useRef } from "react";
import { api } from "../api";
import type { Session } from "../types";
import { usePersistedState } from "./usePersistedState";

interface SessionApi {
  /** The session as it was when the app started; never changes while running. */
  initial: Session;
  /** Records the current work (open documents, active connection) in `session.json`. */
  update: (patch: Partial<Session>) => void;
}

const SessionContext = createContext<SessionApi | null>(null);

/** What the app reopens with. Owners of each part call `update` whenever their part changes. */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { value, update } = usePersistedState(api.getSession, api.setSession);
  const initial = useRef<Session | null>(null);
  if (!value) return null;
  initial.current ??= value;
  return <SessionContext.Provider value={{ initial: initial.current, update }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionApi {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession outside SessionProvider");
  return ctx;
}
