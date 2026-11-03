import { expect, test } from "bun:test";
import { COLOR_TOKENS, isColor, parseTheme, resolveColors, slugify } from "./theme";
import { BUILTIN_THEMES, RESERVED_IDS } from "./themes";

test("every built-in theme sets every color, each a valid color", () => {
  for (const theme of BUILTIN_THEMES) {
    expect(Object.keys(theme.colors).sort(), theme.id).toEqual([...COLOR_TOKENS].sort());
    for (const [token, value] of Object.entries(theme.colors)) expect(isColor(value), `${theme.id}.${token}`).toBe(true);
  }
});

test("built-in ids are unique, reserved, and re-importing one under its name is refused", () => {
  const ids = BUILTIN_THEMES.map((t) => t.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(RESERVED_IDS).toEqual(expect.arrayContaining([...ids, "system"]));
  for (const t of BUILTIN_THEMES) {
    expect(() => parseTheme(JSON.stringify({ name: t.name, type: t.type, colors: {} }), RESERVED_IDS)).toThrow("built-in");
  }
});

test("a partial dark theme is completed from Dark, not from another built-in dark theme", () => {
  const colors = resolveColors({ type: "dark", colors: {} }, BUILTIN_THEMES);
  expect(colors.background).toBe(BUILTIN_THEMES.find((t) => t.id === "dark")!.colors.background!);
});

test("a built-in theme's id is the slug of its name (the file name)", () => {
  for (const t of BUILTIN_THEMES) expect(slugify(t.name), t.id).toBe(t.id);
});
