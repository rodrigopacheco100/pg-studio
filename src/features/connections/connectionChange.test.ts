import { expect, test } from "bun:test";
import type { Conn } from "@/types";
import { needsReconnect } from "./connectionChange";

const conn: Conn = {
  id: 1, name: "a", host: "h", port: 5432, database: "d", user: "u", password: "", ssl: false, folder_id: null,
  environment: "", ssh_enabled: false, ssh_host: "", ssh_port: 22, ssh_user: "", ssh_auth: "key", ssh_key_path: "",
  ssh_secret: "", save_password: true,
};

test("only what the connection depends on makes it reconnect", () => {
  expect(needsReconnect(conn, { ...conn })).toBe(false);
  expect(needsReconnect(conn, { ...conn, name: "b", folder_id: 3, environment: "prod", save_password: false })).toBe(false);
  for (const change of [{ host: "x" }, { port: 1 }, { database: "x" }, { user: "x" }, { ssl: true }, { ssh_enabled: true }, { ssh_host: "x" }, { ssh_key_path: "k" }]) {
    expect(needsReconnect(conn, { ...conn, ...change })).toBe(true);
  }
});

test("a newly typed password or SSH secret reconnects too", () => {
  expect(needsReconnect(conn, { ...conn, password: "new" })).toBe(true);
  expect(needsReconnect(conn, { ...conn, ssh_secret: "new" })).toBe(true);
});
