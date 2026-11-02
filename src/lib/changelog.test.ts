import { expect, test } from "bun:test";
import { compareVersions, noteBlocks, parseChangelog, releasesBetween } from "./changelog";

const sample = `# Changelog

Intro text that is not a change.

## v0.5.0 - 2026-11-02

- feat: b (abc)
- fix: c (def)

## v0.4.0 - 2026-10-01

- feat: a (123)

## v0.3.0

- Initial release
`;

test("parses releases with their dates and changes", () => {
  expect(parseChangelog(sample)).toEqual([
    { version: "0.5.0", date: "2026-11-02", changes: ["feat: b (abc)", "fix: c (def)"] },
    { version: "0.4.0", date: "2026-10-01", changes: ["feat: a (123)"] },
    { version: "0.3.0", date: null, changes: ["Initial release"] },
  ]);
});

test("compares versions numerically", () => {
  expect(compareVersions("1.10.0", "1.9.2")).toBe(1);
  expect(compareVersions("v0.5.0", "0.5")).toBe(0);
  expect(compareVersions("0.4.9", "0.5.0")).toBe(-1);
});

test("selects what changed after the last seen version, up to the current one", () => {
  const all = parseChangelog(sample);
  expect(releasesBetween(all, "0.3.0", "0.5.0").map((r) => r.version)).toEqual(["0.5.0", "0.4.0"]);
  expect(releasesBetween(all, "0.4.0", "0.4.0")).toEqual([]);
  expect(releasesBetween(all, "0.3.0", "0.4.0").map((r) => r.version)).toEqual(["0.4.0"]);
});

test("noteBlocks splits a release body into headings, bullets and text", () => {
  const body = "## What changed\n\n- feat: a (abc)\n- fix: b (def)\n\n**Full comparison:** https://example.com/compare/v1...v2\n";
  expect(noteBlocks(body)).toEqual([
    { kind: "heading", text: "What changed" },
    { kind: "item", text: "feat: a (abc)" },
    { kind: "item", text: "fix: b (def)" },
    { kind: "text", text: "Full comparison: https://example.com/compare/v1...v2" },
  ]);
  expect(noteBlocks("")).toEqual([]);
});
