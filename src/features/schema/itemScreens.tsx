import { Check, Copy, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ColumnDetails,
  ConstraintDetails,
  DetailKind,
  ForeignKeyDetails,
  IndexDetails,
  ItemDetailsMap,
  PermissionDetails,
} from "@/types";

// Building blocks shared by the screens.

const dash = <span className="text-muted-foreground">—</span>;

function Flag({ on, yes = "Yes", no = "No" }: { on: boolean; yes?: string; no?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1", on ? "text-primary" : "text-muted-foreground")}>
      {on ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {on ? yes : no}
    </span>
  );
}

function Chips({ items }: { items: string[] }) {
  if (items.length === 0) return dash;
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((c) => (
        <span key={c} className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{c}</span>
      ))}
    </span>
  );
}

/** Label/value pairs; a missing value renders as a dash so every screen keeps the same shape. */
function Properties({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="selectable min-w-0 break-words">{value === null || value === undefined || value === "" ? dash : value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Table({ head, rows, empty = "None" }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <div className="text-sm text-muted-foreground">{empty}</div>;
  return (
    <div className="overflow-hidden rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-2.5 py-1.5 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              {r.map((cell, j) => <td key={j} className="selectable px-2.5 py-1.5 align-top break-words">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="selectable max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 pr-10 font-mono text-xs whitespace-pre-wrap">{text}</pre>
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute top-1.5 right-1.5"
        title="Copy"
        onClick={() => void navigator.clipboard.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}

const mono = (text: string) => <span className="font-mono text-xs">{text}</span>;

// One screen per kind of item.

function ColumnScreen({ d }: { d: ColumnDetails }) {
  return (
    <>
      <Properties
        rows={[
          ["Name", d.name],
          ["Position", d.position],
          ["Data type", mono(d.type)],
          ["Nullable", <Flag on={!d.notNull} />],
          ["Default", d.default && mono(d.default)],
          ["Identity", d.identity],
          ["Generated", d.generated],
          ["Collation", d.collation],
          ["Storage", d.storage],
          ["Statistics target", d.statisticsTarget],
          ["Comment", d.comment],
        ]}
      />
      <Section title="Constraints">
        <Table head={["Name", "Definition"]} rows={d.constraints.map((c) => [c.name, mono(c.definition)])} />
      </Section>
      <Section title="Indexes">
        <Chips items={d.indexes} />
      </Section>
      <Section title="Referenced by">
        <Table head={["Constraint", "Table", "Definition"]} rows={d.referencedBy.map((r) => [r.name, r.table, mono(r.definition)])} />
      </Section>
    </>
  );
}

function ConstraintScreen({ d }: { d: ConstraintDetails }) {
  return (
    <>
      <Properties
        rows={[
          ["Name", d.name],
          ["Type", d.type],
          ["Columns", <Chips items={d.columns} />],
          ["Backing index", d.index],
          ["Deferrable", <Flag on={d.deferrable} />],
          ...(d.deferrable ? ([["Initially deferred", <Flag on={d.deferred} />]] as [string, ReactNode][]) : []),
          ["Validated", <Flag on={d.validated} />],
          ...(d.type === "CHECK" ? ([["No inherit", <Flag on={d.noInherit} />]] as [string, ReactNode][]) : []),
          ["Comment", d.comment],
        ]}
      />
      <Section title="Definition">
        <Code text={d.definition} />
      </Section>
    </>
  );
}

function ForeignKeyScreen({ d }: { d: ForeignKeyDetails }) {
  return (
    <>
      <Properties
        rows={[
          ["Name", d.name],
          ["Referenced table", d.referencedTable],
          ["On update", d.onUpdate],
          ["On delete", d.onDelete],
          ["Match type", d.match],
          ["Deferrable", <Flag on={d.deferrable} />],
          ...(d.deferrable ? ([["Initially deferred", <Flag on={d.deferred} />]] as [string, ReactNode][]) : []),
          ["Validated", <Flag on={d.validated} />],
          ["Comment", d.comment],
        ]}
      />
      <Section title="Column mapping">
        <Table
          head={["Column", `Referenced column (${d.referencedTable})`]}
          rows={d.columns.map((c) => [mono(c.column), mono(c.referencedColumn)])}
        />
      </Section>
      <Section title="Definition">
        <Code text={d.definition} />
      </Section>
    </>
  );
}

function IndexScreen({ d }: { d: IndexDetails }) {
  return (
    <>
      <Properties
        rows={[
          ["Name", d.name],
          ["Method", d.method],
          ["Unique", <Flag on={d.unique} />],
          ["Primary key", <Flag on={d.primary} />],
          ["Valid", <Flag on={d.valid} />],
          ["Clustered", <Flag on={d.clustered} />],
          ["Size", d.size],
          ["Tablespace", d.tablespace],
          ["Constraint", d.constraint],
          ["Predicate (partial)", d.predicate && mono(d.predicate)],
          ["Comment", d.comment],
        ]}
      />
      <Section title="Columns">
        <Table
          head={["#", "Column / expression", "Role"]}
          rows={d.columns.map((c, i) => [i + 1, mono(c), i < d.keyColumns ? "Key" : "Included"])}
        />
      </Section>
      <Section title="Definition">
        <Code text={d.definition} />
      </Section>
    </>
  );
}

function PermissionScreen({ d }: { d: PermissionDetails }) {
  return (
    <>
      <Properties rows={[["Grantee", d.grantee], ["Table owner", d.owner]]} />
      <Section title="Table privileges">
        <Table
          head={["Privilege", "Grantor", "Grant option"]}
          rows={d.privileges.map((p) => [p.privilege, p.grantor, <Flag on={p.grantable} />])}
        />
      </Section>
      {d.columnPrivileges.length > 0 && (
        <Section title="Column privileges">
          <Table
            head={["Column", "Privilege", "Grant option"]}
            rows={d.columnPrivileges.map((p) => [mono(p.column), p.privilege, <Flag on={p.grantable} />])}
          />
        </Section>
      )}
    </>
  );
}

export const KIND_LABEL: Record<DetailKind, string> = {
  columns: "Column",
  constraints: "Constraint",
  foreign_keys: "Foreign key",
  indexes: "Index",
  permissions: "Permission",
};

/** Picks the screen that fits the kind of item; `data` has the shape `ItemDetailsMap[kind]`. */
export function ItemScreen<K extends DetailKind>({ kind, data }: { kind: K; data: ItemDetailsMap[K] }) {
  switch (kind) {
    case "columns": return <ColumnScreen d={data as ColumnDetails} />;
    case "constraints": return <ConstraintScreen d={data as ConstraintDetails} />;
    case "foreign_keys": return <ForeignKeyScreen d={data as ForeignKeyDetails} />;
    case "indexes": return <IndexScreen d={data as IndexDetails} />;
    case "permissions": return <PermissionScreen d={data as PermissionDetails} />;
  }
}
