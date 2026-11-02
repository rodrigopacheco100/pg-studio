import { createContext, useContext, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "../components/PasswordInput";

interface DialogsApi {
  /** Resolves `true` when confirmed, `false` when cancelled or dismissed. */
  confirm: (message: string, options?: { title?: string; confirmLabel?: string }) => Promise<boolean>;
  alert: (message: string, title?: string) => Promise<void>;
  /**
   * Resolves the entered text, or `null` when cancelled or dismissed. With `validate`, OK runs it first:
   * a returned message is shown in the dialog, which stays open; `null` accepts the text.
   */
  prompt: (label: string, title?: string, options?: PromptOptions) => Promise<string | null>;
}

interface PromptOptions {
  secret?: boolean;
  validate?: (value: string) => Promise<string | null>;
}

type Request =
  | { kind: "confirm"; title: string; message: string; confirmLabel: string; resolve: (ok: boolean) => void }
  | { kind: "alert"; title: string; message: string; resolve: () => void }
  | { kind: "prompt"; title: string; message: string; secret: boolean; validate?: PromptOptions["validate"]; resolve: (value: string | null) => void };

const DialogsContext = createContext<DialogsApi | null>(null);

/**
 * In-app replacements for `window.confirm/alert/prompt`: the native ones are placed arbitrarily by the
 * webview, these are centered like every other dialog. Only one is shown at a time; a new request
 * dismisses the one on screen.
 */
export function DialogsProvider({ children }: { children: React.ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const api = useMemo<DialogsApi>(() => {
    const open = <T,>(make: (resolve: (value: T) => void) => Request) =>
      new Promise<T>((resolve) => {
        setText("");
        setProblem(null);
        setChecking(false);
        setRequest((previous) => {
          dismiss(previous);
          return make(resolve);
        });
      });
    return {
      confirm: (message, options) =>
        open<boolean>((resolve) => ({ kind: "confirm", title: options?.title ?? "Confirm", message, confirmLabel: options?.confirmLabel ?? "OK", resolve })),
      alert: (message, title = "Error") => open<void>((resolve) => ({ kind: "alert", title, message, resolve })),
      prompt: (label, title = "Input", options) => open<string | null>((resolve) => ({ kind: "prompt", title, message: label, secret: options?.secret === true, validate: options?.validate, resolve })),
    };
  }, []);

  /** OK of a prompt: runs its validation (if any) and only closes when the text is accepted. */
  async function submitPrompt() {
    if (request?.kind !== "prompt") return;
    if (request.validate) {
      setChecking(true);
      const found = await request.validate(text);
      setChecking(false);
      if (found) return setProblem(found);
    }
    close(text);
  }

  function close(result?: boolean | string | null) {
    if (!request) return;
    if (request.kind === "confirm") request.resolve(result === true);
    else if (request.kind === "prompt") request.resolve(typeof result === "string" ? result : null);
    else request.resolve();
    setRequest(null);
  }

  return (
    <DialogsContext.Provider value={api}>
      {children}
      {request && (
        <Dialog open onOpenChange={(open) => !open && close()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{request.title}</DialogTitle>
              <DialogDescription className="selectable whitespace-pre-wrap">{request.message}</DialogDescription>
            </DialogHeader>
            {request.kind === "prompt" && (
              <form id="prompt-form" onSubmit={(e) => { e.preventDefault(); void submitPrompt(); }}>
                {(() => {
                  const props = { autoFocus: true, value: text, onChange: (e: React.ChangeEvent<HTMLInputElement>) => { setText(e.target.value); setProblem(null); } };
                  return request.secret ? <PasswordInput {...props} /> : <Input {...props} />;
                })()}
                {problem && <p className="selectable mt-2 text-sm text-destructive">{problem}</p>}
              </form>
            )}
            <DialogFooter>
              {request.kind !== "alert" && <Button variant="outline" onClick={() => close()}>Cancel</Button>}
              {request.kind === "confirm" && <Button autoFocus onClick={() => close(true)}>{request.confirmLabel}</Button>}
              {request.kind === "prompt" && <Button type="submit" form="prompt-form" disabled={checking}>{checking ? "Checking…" : "OK"}</Button>}
              {request.kind === "alert" && <Button autoFocus onClick={() => close()}>OK</Button>}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </DialogsContext.Provider>
  );
}

/** Settles a request that is being replaced by a newer one. */
function dismiss(request: Request | null) {
  if (!request) return;
  if (request.kind === "confirm") request.resolve(false);
  else if (request.kind === "prompt") request.resolve(null);
  else request.resolve();
}

export function useDialogs(): DialogsApi {
  const ctx = useContext(DialogsContext);
  if (!ctx) throw new Error("useDialogs outside DialogsProvider");
  return ctx;
}
