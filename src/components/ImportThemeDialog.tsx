import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { errText, files, pickThemeFile } from "../api";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../lib/theme";

const EXAMPLE = `{
  "name": "Midnight",
  "type": "dark",
  "colors": {
    "background": "#0b1020",
    "foreground": "#e6e9f5",
    "primary": "#5b8def"
  }
}`;

/** Imports a theme from a JSON file or pasted text; closes only once it was valid and stored. */
export function ImportThemeDialog({ onImported, onClose }: { onImported: (theme: Theme) => void; onClose: () => void }) {
  const { importTheme } = useTheme();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function chooseFile() {
    try {
      const path = await pickThemeFile();
      if (path) {
        setText(await files.read(path));
        setError(null);
      }
    } catch (e) {
      setError(errText(e));
    }
  }

  async function submit() {
    setBusy(true);
    try {
      onImported(await importTheme(text));
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import theme</DialogTitle>
          <DialogDescription>
            Paste the theme's JSON or choose a file. Only the colors you list change; the rest come from the built-in theme of the same type.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Theme JSON"
          className="h-56 font-mono text-xs"
          placeholder={EXAMPLE}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
        />
        {error && <p className="selectable text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" className="sm:mr-auto" onClick={() => void chooseFile()}>Choose file…</Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !text.trim()} onClick={() => void submit()}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
