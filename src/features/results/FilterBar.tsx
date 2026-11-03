import { Plus, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { kindOf, needsValue, newFilter, OP_LABELS, opsFor, refit, validValue, type Filter } from "./gridFilter";
import type { QueryResult } from "@/types";
import { OptionSelect } from "@/components/OptionSelect";

interface Props {
  result: Pick<QueryResult, "columns" | "types">;
  /** The filters in effect (the last search). */
  applied: Filter[];
  onSearch: (filters: Filter[]) => void;
}

const PLACEHOLDERS = { text: "text", number: "number", date: "YYYY-MM-DD", bool: "true or false" };

/**
 * The filters of the grid, one row each: column, operator and value; the operators offered depend on the
 * type of the column. Editing only changes a draft: nothing is filtered until Search (or Enter in a value).
 */
export function FilterBar({ result, applied, onSearch }: Props) {
  const blank = () => [newFilter(0, kindOf(result.types[0]))];
  const [draft, setDraft] = useState<Filter[]>(applied.length > 0 ? applied : blank());
  // The filters in effect changed from outside (Clear, a new result): the draft starts over from them.
  useEffect(() => setDraft(applied.length > 0 ? applied : blank()), [applied]); // eslint-disable-line react-hooks/exhaustive-deps

  const columns = result.columns.map((name, value) => ({ value, label: name }));
  const set = (i: number, filter: Filter) => setDraft(draft.map((f, j) => (j === i ? filter : f)));
  const search = () => onSearch(draft);

  return (
    <div className="flex flex-col gap-1.5 border-b bg-muted/30 px-3 py-2">
      {draft.map((f, i) => {
        const kind = kindOf(result.types[f.column]);
        const invalid = needsValue(f.op) && f.value !== "" && !validValue(f, kind);
        return (
          <div key={i} role="group" aria-label={`Filter ${i + 1}`} className="flex items-center gap-1.5">
            <OptionSelect
              label="Filter column"
              className="w-44"
              value={f.column}
              options={columns}
              onChange={(column) => set(i, refit({ ...f, column }, kindOf(result.types[column])))}
            />
            <OptionSelect
              label="Filter operator"
              className="w-40"
              value={f.op}
              options={opsFor(kind).map((op) => ({ value: op, label: OP_LABELS[op] }))}
              onChange={(op) => set(i, { ...f, op })}
            />
            {needsValue(f.op) && (
              <Input
                aria-label="Filter value"
                aria-invalid={invalid}
                placeholder={PLACEHOLDERS[kind]}
                value={f.value}
                onChange={(e) => set(i, { ...f, value: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && search()}
                className="h-8 max-w-64 flex-1 font-mono text-xs"
              />
            )}
            <Button variant="ghost" size="icon-xs" title="Remove filter" aria-label="Remove filter" onClick={() => setDraft(draft.filter((_, j) => j !== i))}>
              <X />
            </Button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button size="xs" onClick={search}><Search /> Search</Button>
        <Button variant="ghost" size="xs" onClick={() => setDraft([...draft, newFilter(0, kindOf(result.types[0]))])}>
          <Plus /> Add filter
        </Button>
      </div>
    </div>
  );
}
