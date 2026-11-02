import type { Conn } from "../types";

/** What a live connection depends on: changing any of these (or typing a new secret) means connecting again. */
const CONNECTION_FIELDS = [
  "host", "port", "database", "user", "ssl",
  "ssh_enabled", "ssh_host", "ssh_port", "ssh_user", "ssh_auth", "ssh_key_path",
] as const satisfies readonly (keyof Conn)[];

/**
 * Does saving `after` over `before` leave the open connection out of date? A new name, folder or
 * environment does not: reconnecting would drop the session (temporary tables, `SET`s) for nothing.
 */
export function needsReconnect(before: Conn, after: Conn): boolean {
  return CONNECTION_FIELDS.some((f) => before[f] !== after[f]) || after.password !== "" || after.ssh_secret !== "";
}
