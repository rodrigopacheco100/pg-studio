/** Words that cannot be unquoted identifiers or table aliases. */
export const RESERVED = new Set(
  `all analyse analyze and any array as asc both case cast check collate column constraint create cross
   current_date current_time current_timestamp current_user default delete desc distinct do else end except
   false fetch for foreign from full grant group having ilike in inner insert intersect into is join leading
   left like limit natural not null offset on only or order outer placing primary references returning right
   select session_user set similar some symmetric table then to trailing true union unique update user using
   values variadic verbose when where window with alter drop lateral`.split(/\s+/),
);

/** Quotes the identifier when it is not valid without quotes (uppercase, symbols, reserved word). */
export function quoteIdent(name: string): string {
  return /^[a-z_][a-z0-9_$]*$/.test(name) && !RESERVED.has(name) ? name : `"${name.replace(/"/g, '""')}"`;
}

export function quoteLiteral(value: string | null): string {
  return value === null ? "NULL" : `'${value.replace(/'/g, "''")}'`;
}
