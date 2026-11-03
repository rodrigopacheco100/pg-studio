import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, errText } from "@/api";
import type { DetailKind, ItemDetailsMap, TableRef } from "@/types";
import { ItemScreen, KIND_LABEL } from "./itemScreens";

interface Props {
  table: TableRef;
  kind: DetailKind;
  name: string;
  onClose: () => void;
}

type State = { data: ItemDetailsMap[DetailKind] } | { error: string } | null;

/** Everything the catalog knows about one column, constraint, foreign key, index or grantee of a table. */
export function ItemDetailsDialog({ table, kind, name, onClose }: Props) {
  const [state, setState] = useState<State>(null);

  useEffect(() => {
    let current = true;
    api.tableItem(table.schema, table.name, kind, name)
      .then((data) => current && setState({ data }))
      .catch((e) => current && setState({ error: errText(e) }));
    return () => { current = false; };
  }, [table.schema, table.name, kind, name]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{KIND_LABEL[kind]}: {name}</DialogTitle>
          <DialogDescription>{table.schema}.{table.name}</DialogDescription>
        </DialogHeader>
        {!state && <div className="text-sm text-muted-foreground">Loading…</div>}
        {state && "error" in state && <div className="selectable text-sm whitespace-pre-wrap text-destructive">{state.error}</div>}
        {state && "data" in state && <ItemScreen kind={kind} data={state.data} />}
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
