import { expect, test } from "bun:test";
import { moveConnection, moveFolder } from "./connectionOrder";
import type { Conn } from "../types";

const c = (id: number, folder_id: number | null): Conn => ({
  id, name: `c${id}`, host: "", port: 5432, database: "", user: "", password: "", ssl: false, folder_id,
});
const view = (l: Conn[]) => l.map((x) => `${x.id}@${x.folder_id}`);
const list = [c(1, null), c(2, 10), c(3, 10), c(4, null)];

test("moves before another connection, adopting its folder", () => {
  expect(view(moveConnection(list, 4, 10, 3))).toEqual(["1@null", "2@10", "4@10", "3@10"]);
});

test("moves to the end of a folder", () => {
  expect(view(moveConnection(list, 1, 10, null))).toEqual(["2@10", "3@10", "1@10", "4@null"]);
});

test("moves out of a folder to the top level", () => {
  expect(view(moveConnection(list, 2, null, null))).toEqual(["1@null", "3@10", "4@null", "2@null"]);
});

test("moves into an empty folder", () => {
  expect(view(moveConnection(list, 1, 11, null))).toEqual(["2@10", "3@10", "4@null", "1@11"]);
});

test("dropping on itself changes nothing", () => {
  expect(moveConnection(list, 2, 10, 2)).toBe(list);
});

test("reorders folders", () => {
  const f = [{ id: 1, name: "a" }, { id: 2, name: "b" }, { id: 3, name: "c" }];
  expect(moveFolder(f, 3, 1).map((x) => x.id)).toEqual([3, 1, 2]);
  expect(moveFolder(f, 1, null).map((x) => x.id)).toEqual([2, 3, 1]);
});
