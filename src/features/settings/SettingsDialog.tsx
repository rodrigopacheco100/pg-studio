import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnownHostsList } from "./KnownHostsList";
import { type Option, OptionSelect } from "@/components/OptionSelect";
import { ThemeSettings } from "./ThemeSettings";
import { useSettings } from "./useSettings";
import { EDITOR_FONTS, type FontOption, pickFont, UI_FONTS } from "./fonts";
import type { Settings } from "@/types";

/** The settings that are a string or a number (the ones a dropdown can pick). */
type ChoiceKey = { [K in keyof Settings]: Settings[K] extends string | number ? K : never }[keyof Settings];

const sizes = (values: number[]): Option<number>[] => values.map((v) => ({ value: v, label: `${v} px` }));
const seconds = (v: number): Option<number> => ({ value: v, label: v < 60 ? `${v} s` : `${v / 60} min` });

/** A labeled dropdown bound to one setting; changes apply and persist immediately. */
function Field<K extends ChoiceKey>({ id, label, setting, choices, hint }: {
  id: string;
  label: string;
  setting: K;
  choices: Option<Settings[K]>[];
  hint?: string;
}) {
  const { settings, update } = useSettings();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <OptionSelect id={id} value={settings[setting]} options={choices} onChange={(value) => update({ [setting]: value } as Partial<Settings>)} />
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
      <OptionSelect id={id} value={current.id} options={options.map((f) => ({ value: f.id, label: f.label }))} onChange={onChange} />
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
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="appearance" className={pane}>
            <ThemeSettings />
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
            <Toggle
              label="Check for updates when the app starts"
              setting="checkForUpdates"
              hint="You can always check from Help › Check for updates."
            />
          </TabsContent>

          <TabsContent value="security" className={pane}>
            <Field
              id="vault-lock"
              label="Lock the master-password vault when idle"
              setting="vaultAutoLockMinutes"
              choices={[{ value: 0, label: "Never" }, ...[5, 15, 30, 60].map((v) => ({ value: v, label: `After ${v} min` }))]}
              hint="Only applies where there is no system keychain."
            />
            <KnownHostsList />
          </TabsContent>
        </Tabs>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
