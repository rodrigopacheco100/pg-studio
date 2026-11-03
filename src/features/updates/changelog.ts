export interface Release {
  /** Without the leading `v`. */
  version: string;
  date: string | null;
  /** The bullet lines, without the leading `- `. */
  changes: string[];
}

/** `1.10.0` > `1.9.2`: compares the numeric parts; a missing part counts as 0. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map((v) => v.replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0));
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0);
    if (diff !== 0) return Math.sign(diff);
  }
  return 0;
}

/**
 * Releases of a `CHANGELOG.md`, newest first as written. A release starts at `## v<version>` (optionally
 * followed by ` - <date>`); its changes are the `- ` lines below it.
 */
export function parseChangelog(markdown: string): Release[] {
  const releases: Release[] = [];
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+v?(\d+(?:\.\d+)*)(?:\s+-\s+(.+?))?\s*$/.exec(line);
    if (heading) releases.push({ version: heading[1], date: heading[2] ?? null, changes: [] });
    else if (releases.length > 0 && line.startsWith("- ")) releases[releases.length - 1].changes.push(line.slice(2).trim());
  }
  return releases;
}

/** The releases after `seen` up to and including `current`, newest first. */
export function releasesBetween(releases: Release[], seen: string, current: string): Release[] {
  return releases.filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0);
}

/** A piece of release notes, as the update dialog shows it. */
export type NoteBlock = { kind: "heading" | "item" | "text"; text: string };

/**
 * Release notes (the GitHub release body that reaches the app through `latest.json`) as blocks: `## ` headings,
 * `- ` bullets and plain lines; blank lines and the markdown emphasis marks are dropped.
 */
export function noteBlocks(body: string): NoteBlock[] {
  const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").trim();
  return body
    .split("\n")
    .map((line): NoteBlock | null => {
      const text = line.trim();
      if (!text) return null;
      if (text.startsWith("#")) return { kind: "heading", text: plain(text.replace(/^#+\s*/, "")) };
      if (text.startsWith("- ")) return { kind: "item", text: plain(text.slice(2)) };
      return { kind: "text", text: plain(text) };
    })
    .filter((b): b is NoteBlock => b !== null);
}
