import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface Option<V extends string | number> {
  value: V;
  label: string;
}

/**
 * A dropdown over a fixed list of options. Radix items need non-empty string values, so they are matched
 * by position: `value` may be anything, including an empty string.
 */
export function OptionSelect<V extends string | number>({ id, value, options, onChange }: {
  id?: string;
  value: V;
  options: Option<V>[];
  onChange: (value: V) => void;
}) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <Select value={index >= 0 ? String(index) : undefined} onValueChange={(i) => onChange(options[Number(i)].value)}>
      <SelectTrigger id={id}>
        {/* A value outside the list (e.g. a settings file edited by hand) stays visible instead of vanishing. */}
        <SelectValue placeholder={String(value)} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o, i) => <SelectItem key={i} value={String(i)}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
