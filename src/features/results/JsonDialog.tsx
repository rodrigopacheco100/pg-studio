import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  title: string;
  json: string;
  onCopy: () => void;
  onClose: () => void;
}

export function JsonDialog({ title, json, onCopy, onClose }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <pre className="selectable max-h-[60vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">{json}</pre>
        <DialogFooter>
          <Button variant="outline" onClick={onCopy}><Copy /> Copy</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
