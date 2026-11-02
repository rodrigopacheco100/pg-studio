/**
 * Column filters of the results grid: a column, an operator and a value (`name starts with al`, `id ≥ 10`).
 * Which operators make sense depends on the type of the column. The same filter runs here, on a query's rows,
 * and as SQL in `pg/catalog.rs`, on a table's: keep `evaluate` and `GridFilter::condition` in step.
 */

/** What a column holds, as far as filtering is concerned. */
export type Kind = "text" | "number" | "date" | "bool";

export type FilterOp = "eq" | "ne" | "gt" | "ge" | "lt" | "le" | "contains" | "not_contains" | "starts" | "ends" | "is_null" | "not_null";

export interface Filter {
  /** Column position in the result. */
  column: number;
  op: FilterOp;
  value: string;
}

const NUMBER_TYPES = new Set(["int2", "int4", "int8", "float4", "float8", "numeric", "oid"]);
const DATE_TYPES = new Set(["date", "timestamp", "timestamptz"]);

/** Kind of a PostgreSQL type name; anything unknown is text. */
export function kindOf(type: string | undefined): Kind {
  if (!type) return "text";
  if (NUMBER_TYPES.has(type)) return "number";
  if (DATE_TYPES.has(type)) return "date";
  return type === "bool" ? "bool" : "text";
}

export const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

export const OP_LABELS: Record<FilterOp, string> = {
  eq: "=", ne: "≠", gt: ">", ge: "≥", lt: "<", le: "≤",
  contains: "contains", not_contains: "does not contain", starts: "starts with", ends: "ends with",
  is_null: "is null", not_null: "is not null",
};

/** Operators of each kind, the first being the default. Dates are ISO text, so they order and match as text. */
const OPS_FOR: Record<Kind, FilterOp[]> = {
  text: ["contains", "not_contains", "starts", "ends", "eq", "ne", "gt", "ge", "lt", "le", "is_null", "not_null"],
  number: ["eq", "ne", "gt", "ge", "lt", "le", "is_null", "not_null"],
  date: ["starts", "eq", "ne", "gt", "ge", "lt", "le", "is_null", "not_null"],
  bool: ["eq", "ne", "is_null", "not_null"],
};

export const opsFor = (kind: Kind): FilterOp[] => OPS_FOR[kind];

export const needsValue = (op: FilterOp) => op !== "is_null" && op !== "not_null";

/** A new filter on `column`, with the first operator that fits it. */
export const newFilter = (column: number, kind: Kind): Filter => ({ column, op: OPS_FOR[kind][0], value: "" });

/** The filter after changing its column: the operator is kept if it still fits, else the first that does. */
export function refit(f: Filter, kind: Kind): Filter {
  return OPS_FOR[kind].includes(f.op) ? f : { ...f, op: OPS_FOR[kind][0] };
}

/** Is the value one this filter can compare with? A number must parse, as PostgreSQL would have to cast it. */
export function validValue(f: Filter, kind: Kind): boolean {
  return !needsValue(f.op) || kind !== "number" || NUMBER.test(f.value.trim());
}

/** A filter takes part once it is complete (a value where one is needed) and valid; until then it is a draft. */
export function isActiveFilter(f: Filter, kind: Kind): boolean {
  return !needsValue(f.op) || (f.value !== "" && validValue(f, kind));
}

/** Does the cell pass the filter? As in SQL, a NULL passes only `is null`. Active filters only. */
export function evaluate(f: Filter, cell: string | null, kind: Kind): boolean {
  if (f.op === "is_null") return cell === null;
  if (f.op === "not_null") return cell !== null;
  if (cell === null) return false;

  if (kind === "number") {
    const [a, b] = [Number(cell), Number(f.value)];
    return { eq: a === b, ne: a !== b, gt: a > b, ge: a >= b, lt: a < b, le: a <= b }[f.op as "eq"] ?? false;
  }
  // Text, dates and booleans. Containing, starting and ending ignore case (ILIKE).
  const [s, w] = [cell, f.value];
  const [sl, wl] = [s.toLowerCase(), w.toLowerCase()];
  switch (f.op) {
    case "contains": return sl.includes(wl);
    case "not_contains": return !sl.includes(wl);
    case "starts": return sl.startsWith(wl);
    case "ends": return sl.endsWith(wl);
    case "eq": return s === w;
    case "ne": return s !== w;
    case "gt": return s > w;
    case "ge": return s >= w;
    case "lt": return s < w;
    case "le": return s <= w;
    default: return false;
  }
}
