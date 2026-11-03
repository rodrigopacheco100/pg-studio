import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errText } from "@/api";
import { useTheme } from "./useTheme";
import { cssColorToHex } from "./color";
import { COLOR_TOKENS, type ColorToken, type Colors, isColor, resolveColors, type Theme, TOKEN_GROUPS, tokenGroup, tokenLabel } from "./theme";
import { BUILTIN_THEMES } from "./themes";

/**
 * Edits the colors of `base` with a live preview of the whole app. Saving stores the result as an imported
 * theme (named after `base` for imported ones, "My <name>" for built-in ones, so a built-in is never replaced);
 * closing without saving restores the theme in effect.
 */
export function ThemeEditorDialog({ base, onSaved, onClose }: { base: Theme; onSaved: (theme: Theme) => void; onClose: () => void }) {
  const { setPreview, importTheme } = useTheme();
  const [name, setName] = useState(base.builtin ? `My ${base.name}` : base.name);
  const [colors, setColors] = useState<Colors>(() => resolveColors(base, BUILTIN_THEMES));
  const [error, setError] = useState<string | null>(null);

  const invalid = useMemo(() => COLOR_TOKENS.filter((t) => !isColor(colors[t])), [colors]);

  // The preview shows only valid colors: a half-typed value keeps the last valid one on screen.
  const [lastValid, setLastValid] = useState<Colors>(colors);
  useEffect(() => {
    if (invalid.length === 0) setLastValid(colors);
  }, [colors, invalid.length]);
  useEffect(() => {
    setPreview({ type: base.type, colors: lastValid });
    return () => setPreview(null);
  }, [lastValid, base.type, setPreview]);

  const set = (token: ColorToken, value: string) => {
    setColors((c) => ({ ...c, [token]: value }));
    setError(null);
  };

  async function save() {
    try {
      onSaved(await importTheme(JSON.stringify({ name, type: base.type, colors })));
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit theme colors</DialogTitle>
          <DialogDescription>Changes show on the whole app right away. A color is #rrggbb, rgb(), hsl() or oklch().</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="theme-name">Name</Label>
          <Input id="theme-name" value={name} onChange={(e) => { setName(e.target.value); setError(null); }} />
        </div>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
          {TOKEN_GROUPS.map((group) => (
            <section key={group} className="space-y-1.5">
              <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group}</h3>
              {COLOR_TOKENS.filter((t) => tokenGroup(t) === group).map((token) => (
                <div key={token} className="grid grid-cols-[1fr_auto_11rem] items-center gap-2">
                  <Label htmlFor={`color-${token}`} className="font-normal">{tokenLabel(token)}</Label>
                  <input
                    type="color"
                    aria-label={`${tokenLabel(token)} picker`}
                    value={cssColorToHex(colors[token]) ?? "#000000"}
                    onChange={(e) => set(token, e.target.value)}
                    className="h-7 w-9 cursor-pointer rounded border border-input bg-transparent p-0.5"
                  />
                  <Input
                    id={`color-${token}`}
                    value={colors[token]}
                    onChange={(e) => set(token, e.target.value)}
                    aria-invalid={invalid.includes(token) || undefined}
                    className="h-7 font-mono text-xs"
                  />
                </div>
              ))}
            </section>
          ))}
        </div>
        {error && <p className="selectable text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={invalid.length > 0 || !name.trim()} onClick={() => void save()}>Save theme</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
