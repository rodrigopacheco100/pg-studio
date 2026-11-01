import type { Conn } from "../types";

export type ConnFields = Omit<Conn, "id" | "name">;

/** Converte postgres://user:senha@host:porta/banco?sslmode=require nos campos de uma conexão. */
export function parseConnUrl(raw: string): ConnFields {
  const u = new URL(raw.trim());
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new Error("A URL deve começar com postgres:// ou postgresql://");
  }
  if (!u.hostname) throw new Error("URL sem host");
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
