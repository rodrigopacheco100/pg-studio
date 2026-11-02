import type { Conn } from "../types";

export interface Environment {
  id: Exclude<Conn["environment"], "">;
  label: string;
  /** The band across the window while connected. */
  band: string;
  /** The small tag next to a connection in the sidebar. */
  tag: string;
}

/** Where a database lives, so production is never mistaken for a scratch database. */
export const ENVIRONMENTS: Environment[] = [
  { id: "dev", label: "Development", band: "bg-emerald-600 text-white", tag: "bg-emerald-600/20 text-emerald-600 dark:text-emerald-400" },
  { id: "staging", label: "Staging", band: "bg-amber-500 text-black", tag: "bg-amber-500/20 text-amber-600 dark:text-amber-400" },
  { id: "prod", label: "Production", band: "bg-red-600 text-white", tag: "bg-red-600/20 text-red-600 dark:text-red-400" },
];

export const environmentOf = (c: Pick<Conn, "environment"> | undefined) => ENVIRONMENTS.find((e) => e.id === c?.environment);
