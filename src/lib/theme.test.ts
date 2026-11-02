import { expect, test } from "bun:test";
import { parseTheme, resolveColors, slugify, type Theme } from "./theme";

const theme = (o: object) => JSON.stringify({ name: "Midnight", type: "dark", colors: { background: "#0b1020" }, ...o });

test("parses a valid theme and derives its id", () => {
  expect(parseTheme(theme({}))).toEqual({ id: "midnight", name: "Midnight", type: "dark", colors: { background: "#0b1020" } });
});

test("slugify keeps the id safe for a file name", () => {
  expect(slugify("  Solarized / Dark ✨ ")).toBe("solarized-dark");
  expect(slugify("../../etc/passwd")).toBe("etc-passwd");
});

test("reports what is wrong", () => {
  expect(() => parseTheme("{")).toThrow("not valid JSON");
  expect(() => parseTheme(theme({ name: "" }))).toThrow('"name"');
  expect(() => parseTheme(theme({ name: "Dark" }), ["dark", "light"])).toThrow("built-in");
  expect(() => parseTheme(theme({ type: "blue" }))).toThrow('"type"');
  expect(() => parseTheme(theme({ colors: { nope: "#fff" } }))).toThrow('Unknown color "nope"');
  expect(() => parseTheme(theme({ colors: { background: "red; } body { display: none" } }))).toThrow("not a color");
  expect(() => parseTheme(theme({ colors: { background: 12 } }))).toThrow("not a color");
});

test("accepts the usual color notations", () => {
  for (const c of ["#fff", "#0b1020", "#0b102080", "rgb(10 20 30 / 50%)", "hsl(210, 40%, 50%)", "oklch(0.7 0.15 250)", "oklch(1 0 0 / 10%)", "transparent"]) {
    expect(parseTheme(theme({ colors: { border: c } })).colors.border).toBe(c);
  }
});

test("a partial theme is completed from the built-in theme of its type", () => {
  const builtins = [
    { id: "dark", name: "Dark", type: "dark", builtin: true, colors: { background: "A", foreground: "B" } },
    { id: "light", name: "Light", type: "light", builtin: true, colors: { background: "C", foreground: "D" } },
  ] as Theme[];
  expect(resolveColors({ type: "dark", colors: { background: "X" } }, builtins)).toEqual({ background: "X", foreground: "B" });
  expect(resolveColors({ type: "light", colors: {} }, builtins)).toEqual({ background: "C", foreground: "D" });
});
