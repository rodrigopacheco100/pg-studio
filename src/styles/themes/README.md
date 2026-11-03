# Themes

Each `*.json` file here is a built-in theme; they are bundled into the app by `src/features/settings/themes.ts`, which
lists them in order (and reserves their names). `dark.json` and `light.json` are the originals and also
the base that imported themes are completed from. `dracula.json` and `omni.json` use the official
palettes of [dracula/dracula-theme](https://github.com/dracula/dracula-theme) and
[getomni/omni](https://github.com/getomni/omni), mapped to the tokens below the way their VS Code themes
([dracula/visual-studio-code](https://github.com/dracula/visual-studio-code),
[getomni/visual-studio-code](https://github.com/getomni/visual-studio-code)) use them for the interface. Themes imported by the user (Settings › Appearance › Import theme…) are stored as
the same kind of file in the `styles` folder of the app data directory.

```json
{
  "name": "Midnight",
  "type": "dark",
  "colors": {
    "background": "#0b1020",
    "foreground": "#e6e9f5",
    "primary": "oklch(0.65 0.18 260)"
  }
}
```

- **name**: shown in the theme list. Its slug is the id and the file name. The names of the built-in themes
  and `System` are reserved.
- **type**: `dark` or `light`. It decides the `dark` class (Tailwind `dark:` variants, native controls,
  editor syntax highlighting) and which built-in theme fills the colors you leave out.
- **colors**: any of the tokens below. Leave out what you do not want to change. Values are `#hex`,
  `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` or `transparent`.

Tokens (each is the CSS variable `--<token>`): `background`, `foreground`, `card`, `card-foreground`,
`popover`, `popover-foreground`, `primary`, `primary-foreground`, `secondary`, `secondary-foreground`,
`muted`, `muted-foreground`, `accent`, `accent-foreground`, `destructive`, `border`, `input`, `ring`,
`chart-1` … `chart-5`, `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`,
`sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring`.

"Copy as template" in the settings copies the current theme with every token, a good starting point.
