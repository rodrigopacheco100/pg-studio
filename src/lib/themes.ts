import dark from "../styles/themes/dark.json";
import dracula from "../styles/themes/dracula.json";
import light from "../styles/themes/light.json";
import omni from "../styles/themes/omni.json";
import type { Theme } from "./theme";

/**
 * The themes that ship with the app (src/styles/themes), in the order they are listed. `dark` and `light`
 * are also the base that other themes of their type are completed from (see `resolveColors`).
 */
export const BUILTIN_THEMES: Theme[] = [
  { id: "dark", ...dark, builtin: true },
  { id: "light", ...light, builtin: true },
  { id: "dracula", ...dracula, builtin: true },
  { id: "omni", ...omni, builtin: true },
] as Theme[];

/** Ids a custom theme cannot take: the built-in themes and the "follow the system" choice. */
export const RESERVED_IDS = [...BUILTIN_THEMES.map((t) => t.id), "system"];
