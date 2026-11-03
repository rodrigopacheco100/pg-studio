import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Release } from "./changelog";

/** What changed, release by release (newest first), as written in CHANGELOG.md. */
export function WhatsNewDialog({ title, description, releases, onClose }: {
  title: string;
  description: string;
  releases: Release[];
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="selectable max-h-96 space-y-4 overflow-y-auto pr-1">
          {releases.map((r) => (
            <section key={r.version}>
              <h3 className="text-sm font-semibold">
                v{r.version}
                {r.date && <span className="ml-2 font-normal text-muted-foreground">{r.date}</span>}
              </h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {r.changes.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
