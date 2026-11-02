import type { Conn } from "../types";

export type ConnFields = Omit<Conn, "id" | "name" | "folder_id">;

/** Converts postgres://user:password@host:port/database?sslmode=require into the fields of a connection. */
export function parseConnUrl(raw: string): ConnFields {
  const u = new URL(raw.trim());
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new Error("The URL must start with postgres:// or postgresql://");
  }
  if (!u.hostname) throw new Error("URL without host");
  const mode = u.searchParams.get("sslmode") ?? "";
  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.slice(1)) || "postgres",
    user: decodeURIComponent(u.username) || "postgres",
    password: decodeURIComponent(u.password),
    ssl: ["require", "verify-ca", "verify-full"].includes(mode) || u.searchParams.get("ssl") === "true",
  };
}
