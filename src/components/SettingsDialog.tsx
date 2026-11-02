import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useSettings } from "../hooks/useSettings";
import { EDITOR_FONTS, type FontOption, pickFont, UI_FONTS } from "../lib/fonts";

const select =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
      <select id={id} className={select} value={current.id} onChange={(e) => onChange(e.target.value)}>
        {options.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
      </select>
      <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm" style={{ fontFamily: current.family }}>{sample}</div>
    </div>
  );
}

/** Program settings. Changes apply and are saved immediately, so there is nothing to confirm. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Saved automatically in settings.json.</DialogDescription>
        </DialogHeader>
        <FontPicker
          id="ui-font"
          label="Interface font"
          options={UI_FONTS}
          value={settings.uiFont}
          onChange={(uiFont) => update({ uiFont })}
          sample="The quick brown fox jumps over the lazy dog 0123456789"
        />
        <FontPicker
          id="editor-font"
          label="Editor font"
          options={EDITOR_FONTS}
          value={settings.editorFont}
          onChange={(editorFont) => update({ editorFont })}
          sample="SELECT id, name FROM users WHERE id >= 10; -- 0123456789"
        />
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
