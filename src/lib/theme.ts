/** The colors a theme can set; each is the CSS variable `--<token>` that the interface's Tailwind colors read. */
export const COLOR_TOKENS = [
  "background", "foreground",
  "card", "card-foreground",
  "popover", "popover-foreground",
  "primary", "primary-foreground",
  "secondary", "secondary-foreground",
  "muted", "muted-foreground",
  "accent", "accent-foreground",
  "destructive", "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground",
  "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground",
  "sidebar-border", "sidebar-ring",
] as const;

export type ColorToken = (typeof COLOR_TOKENS)[number];
export type Colors = Record<ColorToken, string>;

/** `dark` themes get the `dark` class (Tailwind's `dark:` variants, native controls, editor highlighting). */
export type ThemeType = "dark" | "light";

export interface Theme {
  /** Slug of the name; also the file name of an imported theme. */
  id: string;
  name: string;
  type: ThemeType;
  /** A custom theme may set only some tokens; the rest come from the built-in theme of the same type. */
  colors: Partial<Colors>;
  builtin: boolean;
}

export const slugify = (name: string) =>
  name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// Hex, or one of the CSS color functions with a safe character set: nothing that could close the declaration.
const COLOR = /^(#[0-9a-f]{3,8}|transparent|(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(\s*[-+0-9a-z.,%/\s]+\))$/i;

export const isColor = (value: unknown): value is string => typeof value === "string" && COLOR.test(value.trim());

/**
 * Parses and validates the JSON of a theme file; throws an `Error` whose message says what is wrong.
 * `reservedIds` are the ids a theme cannot take (the built-in ones).
 */
export function parseTheme(json: string, reservedIds: string[] = []): Omit<Theme, "builtin"> {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    throw new Error("This is not valid JSON.");
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("A theme is a JSON object.");
  const { name, type, colors } = data as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) throw new Error('The theme needs a "name".');
  const id = slugify(name);
  if (!id) throw new Error('The "name" needs letters or digits.');
  if (reservedIds.includes(id)) throw new Error(`The name "${name}" is taken by a built-in theme; choose another.`);
  if (type !== "dark" && type !== "light") throw new Error('"type" must be "dark" or "light".');
  if (typeof colors !== "object" || colors === null || Array.isArray(colors)) throw new Error('The theme needs a "colors" object.');

  const valid: Partial<Colors> = {};
  for (const [token, value] of Object.entries(colors)) {
    if (!(COLOR_TOKENS as readonly string[]).includes(token)) {
      throw new Error(`Unknown color "${token}". Known colors: ${COLOR_TOKENS.join(", ")}.`);
    }
    if (!isColor(value)) throw new Error(`The value of "${token}" is not a color (use #rrggbb, rgb(), hsl() or oklch()).`);
    valid[token as ColorToken] = value.trim();
  }
  return { id, name: name.trim(), type, colors: valid };
}

/** Every token of `theme`, completed from the built-in theme named after its type (`dark` or `light`). */
export function resolveColors(theme: Pick<Theme, "type" | "colors">, builtins: Theme[]): Colors {
  const base = builtins.find((t) => t.builtin && t.id === theme.type);
  return { ...base?.colors, ...theme.colors } as Colors;
}
