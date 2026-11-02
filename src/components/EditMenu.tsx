import { ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";

/** The clipboard text, or `null` when the webview does not allow reading it (Ctrl+V still works). */
async function readClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

interface Actions {
  canCut: boolean;
  canCopy: boolean;
  canPaste: boolean;
  cut: () => void;
  copy: () => void;
  /** Receives the clipboard text, already read. */
  paste: (text: string) => void;
  selectAll: () => void;
}

/** Cut / Copy / Paste / Select all, as the entries of a context menu (placed inside a `ContextMenu`). */
export function EditMenuItems({ canCut, canCopy, canPaste, cut, copy, paste, selectAll }: Actions) {
  return (
    <>
      <ContextMenuItem disabled={!canCut} onSelect={cut}>Cut</ContextMenuItem>
      <ContextMenuItem disabled={!canCopy} onSelect={copy}>Copy</ContextMenuItem>
      <ContextMenuItem disabled={!canPaste} onSelect={() => void readClipboard().then((text) => text && paste(text))}>
        Paste
      </ContextMenuItem>
      <ContextMenuItem onSelect={selectAll}>Select all</ContextMenuItem>
    </>
  );
}

/** Context menu of a text field. The field is read when the menu opens, not when the field renders. */
export function FieldMenu({ field }: { field: React.RefObject<HTMLInputElement | null> }) {
  return (
    <ContextMenuContent>
      <FieldMenuItems field={field} />
    </ContextMenuContent>
  );
}

/** Mounted only while the menu is open, so selection and read-only state are current. */
function FieldMenuItems({ field }: { field: React.RefObject<HTMLInputElement | null> }) {
  const el = field.current;
  const hasSelection = !!el && el.selectionStart !== null && el.selectionStart !== el.selectionEnd;
  const editable = !!el && !el.readOnly && !el.disabled;
  // The menu takes focus; give it back to the field before acting on it.
  const act = (command: string, value?: string) => {
    el?.focus();
    document.execCommand(command, false, value);
  };
  return (
    <EditMenuItems
      canCut={hasSelection && editable}
      canCopy={hasSelection}
      canPaste={editable}
      cut={() => act("cut")}
      copy={() => act("copy")}
      paste={(text) => act("insertText", text)}
      selectAll={() => {
        el?.focus();
        el?.select();
      }}
    />
  );
}
