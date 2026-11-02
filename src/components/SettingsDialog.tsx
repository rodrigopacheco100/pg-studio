import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSettings } from "../hooks/useSettings";
import { EDITOR_FONTS, type FontOption, pickFont, UI_FONTS } from "../lib/fonts";
import type { Settings } from "../types";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface Choice<V> {
  value: V;
  label: string;
}

const sizes = (values: number[]): Choice<number>[] => values.map((v) => ({ value: v, label: `${v} px` }));
const seconds = (v: number): Choice<number> => ({ value: v, label: v < 60 ? `${v} s` : `${v / 60} min` });

/** A labeled dropdown bound to one setting; changes apply and persist immediately. */
function Field<K extends keyof Settings>({ id, label, setting, choices, hint }: {
  id: string;
  label: string;
  setting: K;
  choices: Choice<Settings[K]>[];
  hint?: string;
}) {
  const { settings, update } = useSettings();
  const index = Math.max(0, choices.findIndex((c) => c.value === settings[setting]));
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectClass}
        value={index}
        onChange={(e) => update({ [setting]: choices[Number(e.target.value)].value } as Partial<Settings>)}
      >
        {/* A saved value outside the presets (edited by hand) is kept visible instead of being replaced. */}
        {!choices.some((c) => c.value === settings[setting]) && (
          <option value={-1} disabled>{String(settings[setting])}</option>
        )}
        {choices.map((c, i) => <option key={i} value={i}>{c.label}</option>)}
      </select>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ label, setting, hint }: { label: string; setting: { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings]; hint?: string }) {
  const { settings, update } = useSettings();
  return (
    <div className="space-y-1">
      <Label className="gap-2 font-normal">
        <Checkbox checked={settings[setting]} onCheckedChange={(v) => update({ [setting]: v === true })} />
        {label}
      </Label>
      {hint && <p className="pl-6 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function FontPicker({ id, label, options, value, onChange, sample }: {
  id: string;
  label: string;
  options: FontOption[];
  value: string;
  onChange: (id: string) => void;
  sample: string;
}) {
  const current = pickFont(options, value);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} className={selectClass} value={current.id} onChange={(e) => onChange(e.target.value)}>
        {options.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm" style={{ fontFamily: current.family }}>{sample}</div>
    </div>
  );
}

const pane = "grid min-h-80 content-start gap-4 pt-3";

/** Program settings. Changes apply and are saved immediately, so there is nothing to confirm. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="appearance">
          <TabsList variant="line">
            <TabsTrigger value="appearance">Appearance</TabsTrigger>
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="query">Query</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className={pane}>
            <Field
              id="theme"
              label="Theme"
              setting="theme"
              choices={[{ value: "dark", label: "Dark" }, { value: "light", label: "Light" }, { value: "system", label: "Follow the system" }]}
            />
            <FontPicker
              id="ui-font"
              label="Interface font"
              options={UI_FONTS}
              value={settings.uiFont}
              onChange={(uiFont) => update({ uiFont })}
              sample="The quick brown fox jumps over the lazy dog 0123456789"
            />
            <Field id="ui-size" label="Interface text size" setting="uiFontSize" choices={sizes([13, 14, 15, 16, 17, 18, 20])} />
          </TabsContent>

          <TabsContent value="editor" className={pane}>
            <FontPicker
              id="editor-font"
              label="Editor font"
              options={EDITOR_FONTS}
              value={settings.editorFont}
              onChange={(editorFont) => update({ editorFont })}
              sample="SELECT id, name FROM users WHERE id >= 10; -- 0123456789"
            />
            <Field id="editor-size" label="Editor text size" setting="editorFontSize" choices={sizes([11, 12, 13, 14, 15, 16, 18, 20])} />
            <Field
              id="tab-size"
              label="Tab size"
              setting="tabSize"
              choices={[2, 4, 8].map((v) => ({ value: v, label: `${v} spaces` }))}
              hint="Used when pressing Tab and by Beautify."
            />
            <Field
              id="keyword-case"
              label="Keywords in Beautify"
              setting="keywordCase"
              choices={[{ value: "upper", label: "UPPERCASE" }, { value: "lower", label: "lowercase" }, { value: "preserve", label: "As written" }]}
            />
            <Toggle label="Show line numbers" setting="lineNumbers" />
          </TabsContent>

          <TabsContent value="query" className={pane}>
            <Field
              id="page-size"
              label="Rows per page"
              setting="pageSize"
              choices={[25, 50, 100, 250, 500, 1000].map((v) => ({ value: v, label: `${v} rows` }))}
            />
            <Field
              id="timeout"
              label="Statement timeout"
              setting="statementTimeoutSeconds"
              choices={[{ value: 0, label: "No limit" }, ...[5, 15, 30, 60, 300, 600].map(seconds)]}
              hint="Queries running longer are cancelled by the server. Applies to the current connection too."
            />
            <Toggle label="Confirm before DROP, TRUNCATE, and DELETE / UPDATE without WHERE" setting="confirmDestructive" />
          </TabsContent>

          <TabsContent value="general" className={pane}>
            <Toggle
              label="Reconnect to the last connection on startup"
              setting="restoreConnection"
              hint="Connections that ask for a password are never reconnected automatically."
            />
            <Toggle label="Confirm before closing a tab with unsaved changes" setting="confirmCloseDirty" />
            <Field
              id="vault-lock"
              label="Lock the master-password vault when idle"
              setting="vaultAutoLockMinutes"
              choices={[{ value: 0, label: "Never" }, ...[5, 15, 30, 60].map((v) => ({ value: v, label: `After ${v} min` }))]}
              hint="Only applies where there is no system keychain."
            />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
