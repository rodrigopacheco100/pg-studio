import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { errText, files, pickThemeToSave } from "@/api";
import { useDialogs } from "@/hooks/useDialogs";
import { useSettings } from "./useSettings";
import { useTheme } from "./useTheme";
import { resolveColors, slugify } from "./theme";
import { BUILTIN_THEMES } from "./themes";
import { ImportThemeDialog } from "./ImportThemeDialog";
import { ThemeEditorDialog } from "./ThemeEditorDialog";
import { OptionSelect } from "@/components/OptionSelect";

/** Theme choice, plus import / delete of custom themes and a way to copy the current one as a starting point. */
export function ThemeSettings() {
  const { settings, update } = useSettings();
  const { themes, active, removeTheme } = useTheme();
  const dialogs = useDialogs();
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  const options = [...themes.map((t) => ({ value: t.id, label: t.name })), { value: "system", label: "Follow the system" }];

  async function remove() {
    if (!(await dialogs.confirm(`Delete the theme "${active.name}"?`, { title: "Delete theme", confirmLabel: "Delete" }))) return;
    try {
      await removeTheme(active.id);
      update({ theme: "dark" });
    } catch (e) {
      void dialogs.alert(errText(e));
    }
  }

  /** The active theme with every color, named so that importing it again does not clash with a built-in one. */
  const template = () => ({
    name: active.builtin ? `My ${active.name}` : active.name,
    type: active.type,
    colors: resolveColors(active, BUILTIN_THEMES),
  });

  async function copyAsTemplate() {
    await navigator.clipboard.writeText(JSON.stringify(template(), null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  async function exportToFile() {
    try {
      const t = template();
      const path = await pickThemeToSave(`${slugify(t.name)}.json`);
      if (path) await files.write(path, JSON.stringify(t, null, 2) + "\n");
    } catch (e) {
      void dialogs.alert(errText(e));
    }
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="theme">Theme</Label>
      <OptionSelect id="theme" value={settings.theme} options={options} onChange={(theme) => update({ theme })} />
      <div className="flex flex-wrap gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={() => setImporting(true)}>Import theme…</Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>{active.builtin ? "Customize…" : "Edit colors…"}</Button>
        <Button variant="outline" size="sm" onClick={() => void exportToFile()}>Export theme…</Button>
        <Button variant="outline" size="sm" onClick={() => void copyAsTemplate()}>{copied ? "Copied" : "Copy as template"}</Button>
        {!active.builtin && <Button variant="outline" size="sm" onClick={() => void remove()}>Delete theme</Button>}
      </div>
      <p className="text-xs text-muted-foreground">
        A theme is a JSON file with a name, a type (dark or light) and colors. Imported themes are kept in the app's styles folder.
      </p>
      {editing && (
        <ThemeEditorDialog
          base={active}
          onSaved={(theme) => {
            update({ theme: theme.id });
            setEditing(false);
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {importing && (
        <ImportThemeDialog
          onImported={(theme) => {
            update({ theme: theme.id });
            setImporting(false);
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </div>
  );
}
