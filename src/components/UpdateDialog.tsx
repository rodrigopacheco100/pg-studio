import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { errText } from "../api";
import { noteBlocks } from "../lib/changelog";

type Phase = { kind: "ask" } | { kind: "installing"; percent: number | null } | { kind: "failed"; message: string };

/** The notes of the new version: headings, bullets and text of the release body. */
function ReleaseNotes({ body }: { body: string }) {
  const blocks = noteBlocks(body);
  return (
    <div className="selectable max-h-72 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-3 text-sm">
      {blocks.length === 0 && <p className="text-muted-foreground">No release notes.</p>}
      {blocks.map((b, i) =>
        b.kind === "heading" ? (
          <h3 key={i} className="pt-1 font-semibold first:pt-0">{b.text}</h3>
        ) : b.kind === "item" ? (
          <p key={i} className="pl-4 -indent-3 before:mr-1.5 before:content-['•']">{b.text}</p>
        ) : (
          <p key={i} className="pt-1 break-all text-muted-foreground">{b.text}</p>
        ),
      )}
    </div>
  );
}

/** A new version is available: shows its notes and installs it, then restarts the app. */
export function UpdateDialog({ update, onClose }: { update: Update; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>({ kind: "ask" });
  const busy = phase.kind === "installing";

  async function install() {
    let total = 0;
    let received = 0;
    setPhase({ kind: "installing", percent: null });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") total = event.data.contentLength ?? 0;
        if (event.event === "Progress") {
          received += event.data.chunkLength;
          setPhase({ kind: "installing", percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : null });
        }
      });
      await relaunch();
    } catch (e) {
      setPhase({ kind: "failed", message: errText(e) });
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Update available</DialogTitle>
          <DialogDescription>
            PG Studio {update.version} is available (you have {update.currentVersion}).
          </DialogDescription>
        </DialogHeader>
        <ReleaseNotes body={update.body ?? ""} />
        {phase.kind === "installing" && (
          <p className="text-sm text-muted-foreground">
            Downloading and installing{phase.percent === null ? "…" : ` — ${phase.percent}%`} The app restarts when it is done.
          </p>
        )}
        {phase.kind === "failed" && <p className="selectable text-sm text-destructive">Could not update: {phase.message}</p>}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={onClose}>{phase.kind === "failed" ? "Close" : "Later"}</Button>
          <Button disabled={busy} onClick={() => void install()}>{phase.kind === "failed" ? "Try again" : "Install and restart"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
