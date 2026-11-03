import catppuccinLatte from "@/styles/themes/catppuccin-latte.json";
import catppuccinMocha from "@/styles/themes/catppuccin-mocha.json";
import dark from "@/styles/themes/dark.json";
import dracula from "@/styles/themes/dracula.json";
import light from "@/styles/themes/light.json";
import nord from "@/styles/themes/nord.json";
import omni from "@/styles/themes/omni.json";
import solarizedDark from "@/styles/themes/solarized-dark.json";
import solarizedLight from "@/styles/themes/solarized-light.json";
import tokyoNight from "@/styles/themes/tokyo-night.json";
import type { Theme } from "./theme";

/**
 * The themes that ship with the app (src/styles/themes), in the order they are listed. The id is the file
 * name, which is also the slug of the theme's name. `dark` and `light` are the base that other themes of
 * their type are completed from (see `resolveColors`).
 */
export const BUILTIN_THEMES: Theme[] = [
  { id: "dark", ...dark },
  { id: "light", ...light },
  { id: "dracula", ...dracula },
  { id: "omni", ...omni },
  { id: "nord", ...nord },
  { id: "tokyo-night", ...tokyoNight },
  { id: "catppuccin-mocha", ...catppuccinMocha },
  { id: "catppuccin-latte", ...catppuccinLatte },
  { id: "solarized-dark", ...solarizedDark },
  { id: "solarized-light", ...solarizedLight },
].map((t) => ({ ...t, builtin: true })) as Theme[];

/** Ids a custom theme cannot take: the built-in themes and the "follow the system" choice. */
export const RESERVED_IDS = [...BUILTIN_THEMES.map((t) => t.id), "system"];
