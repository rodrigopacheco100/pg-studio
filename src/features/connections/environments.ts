import type { Conn } from "@/types";

export interface Environment {
  id: Exclude<Conn["environment"], "">;
  label: string;
  /** The band across the window while connected. */
  band: string;
  /** The small tag next to a connection in the sidebar. */
  tag: string;
}

/**
 * Where a database lives, so production is never mistaken for a scratch database. The colors are the
 * theme's `env-*` tokens (see src/lib/theme.ts), so every theme can restyle them.
 */
export const ENVIRONMENTS: Environment[] = [
  { id: "dev", label: "Development", band: "bg-(--env-dev) text-(--env-dev-foreground)", tag: "bg-[color-mix(in_oklch,var(--env-dev)_20%,transparent)] text-(--env-dev)" },
  { id: "staging", label: "Staging", band: "bg-(--env-staging) text-(--env-staging-foreground)", tag: "bg-[color-mix(in_oklch,var(--env-staging)_20%,transparent)] text-(--env-staging)" },
  { id: "prod", label: "Production", band: "bg-(--env-prod) text-(--env-prod-foreground)", tag: "bg-[color-mix(in_oklch,var(--env-prod)_20%,transparent)] text-(--env-prod)" },
];

export const environmentOf = (c: Pick<Conn, "environment"> | undefined) => ENVIRONMENTS.find((e) => e.id === c?.environment);
