export interface FontOption {
  id: string;
  label: string;
  /** CSS `font-family` value. */
  family: string;
}

/** Fonts bundled with the app (`@fontsource-variable/*`, imported in index.css), so they work offline. */
export const UI_FONTS: FontOption[] = [
  { id: "roboto", label: "Roboto", family: "'Roboto Variable', sans-serif" },
  { id: "inter", label: "Inter", family: "'Inter Variable', sans-serif" },
  { id: "open-sans", label: "Open Sans", family: "'Open Sans Variable', sans-serif" },
  { id: "source-sans-3", label: "Source Sans 3", family: "'Source Sans 3 Variable', sans-serif" },
  { id: "system-ui", label: "System default", family: "system-ui, sans-serif" },
];

export const EDITOR_FONTS: FontOption[] = [
  { id: "system-mono", label: "System monospace", family: "ui-monospace, SFMono-Regular, monospace" },
  { id: "jetbrains-mono", label: "JetBrains Mono", family: "'JetBrains Mono Variable', monospace" },
  { id: "fira-code", label: "Fira Code", family: "'Fira Code Variable', monospace" },
  { id: "source-code-pro", label: "Source Code Pro", family: "'Source Code Pro Variable', monospace" },
];

/** The option with `id`, or the first one if the id is unknown (e.g. a font removed in a later version). */
export const pickFont = (options: FontOption[], id: string) => options.find((f) => f.id === id) ?? options[0];
