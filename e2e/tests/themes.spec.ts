import { expect, test } from "../support/test";
import type { Studio } from "../support/studio";

const midnight = JSON.stringify({
  name: "Midnight",
  type: "dark",
  colors: { background: "#0b1020", foreground: "#e6e9f5", primary: "#5b8def" },
});

/** Settings › Appearance › Import theme…, pasting `json`; returns the import dialog. */
async function startImport(studio: Studio, json: string) {
  const settings = await studio.openSettings("Appearance");
  await settings.getByRole("button", { name: "Import theme…" }).click();
  const importing = studio.dialog("Import theme");
  await importing.getByLabel("Theme JSON").fill(json);
  return { settings, importing };
}

test("an imported theme is applied, kept after a reload, and listed with the others", async ({ studio, page }) => {
  const { settings, importing } = await startImport(studio, midnight);
  // Settings are saved a moment after the change (debounced); a reload before that would lose it in a browser.
  const saved = page.waitForRequest((r) => (r.postData() ?? "").includes('"theme":"midnight"'));
  await importing.getByRole("button", { name: "Import" }).click();
  await saved;

  await expect(importing).toBeHidden();
  await expect(settings.getByLabel("Theme")).toHaveText("Midnight");
  await studio.expectCssVariable("--background", "#0b1020");
  await studio.expectCssVariable("--primary", "#5b8def");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await page.reload();
  await studio.expectCssVariable("--background", "#0b1020");
  await studio.openSettings("Appearance");
  await studio.page.getByLabel("Theme").click();
  await expect(page.getByRole("option", { name: "Midnight", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Dark", exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: "Light", exact: true })).toBeVisible();
});

test("colors a theme does not set come from the built-in theme of its type", async ({ studio, page }) => {
  const settings = await studio.openSettings("Appearance");
  await studio.choose(settings.getByLabel("Theme"), "Light");
  const lightForeground = await studio.cssVariable("--foreground");

  const light = JSON.stringify({ name: "Paper", type: "light", colors: { background: "#faf6ee" } });
  await settings.getByRole("button", { name: "Import theme…" }).click();
  await studio.dialog("Import theme").getByLabel("Theme JSON").fill(light);
  await studio.dialog("Import theme").getByRole("button", { name: "Import" }).click();

  await studio.expectCssVariable("--background", "#faf6ee");
  await studio.expectCssVariable("--foreground", lightForeground);
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("an invalid theme is explained inside the dialog, which stays open", async ({ studio }) => {
  const { importing } = await startImport(studio, "{ not json");
  await importing.getByRole("button", { name: "Import" }).click();
  await expect(importing.getByText("not valid JSON")).toBeVisible();

  await importing.getByLabel("Theme JSON").fill(JSON.stringify({ name: "Bad", type: "dark", colors: { background: "red; x" } }));
  await importing.getByRole("button", { name: "Import" }).click();
  await expect(importing.getByText(/"background" is not a color/)).toBeVisible();

  await importing.getByLabel("Theme JSON").fill(JSON.stringify({ name: "Dark", type: "dark", colors: {} }));
  await importing.getByRole("button", { name: "Import" }).click();
  await expect(importing.getByText(/taken by a built-in theme/)).toBeVisible();

  await importing.getByLabel("Theme JSON").fill(JSON.stringify({ name: "Typo", type: "dark", colors: { backgroud: "#000" } }));
  await importing.getByRole("button", { name: "Import" }).click();
  await expect(importing.getByText(/Unknown color "backgroud"/)).toBeVisible();
  await expect(importing).toBeVisible();
});

test("a custom theme can be deleted, which brings back the dark theme", async ({ studio, page }) => {
  const { settings, importing } = await startImport(studio, midnight);
  await importing.getByRole("button", { name: "Import" }).click();
  await expect(settings.getByLabel("Theme")).toHaveText("Midnight");

  await settings.getByRole("button", { name: "Delete theme" }).click();
  await studio.dialog("Delete theme").getByRole("button", { name: "Delete" }).click();

  await expect(settings.getByLabel("Theme")).toHaveText("Dark");
  await expect(settings.getByRole("button", { name: "Delete theme" })).toHaveCount(0);
  await settings.getByLabel("Theme").click();
  await expect(page.getByRole("option", { name: "Midnight", exact: true })).toHaveCount(0);
});

test("the built-in themes cannot be deleted", async ({ studio }) => {
  const settings = await studio.openSettings("Appearance");
  await expect(settings.getByRole("button", { name: "Delete theme" })).toHaveCount(0);
  await expect(settings.getByRole("button", { name: "Import theme…" })).toBeVisible();
});

test("the built-in Dracula and Omni themes use their official palettes", async ({ studio, page }) => {
  const settings = await studio.openSettings("Appearance");

  await studio.choose(settings.getByLabel("Theme"), "Dracula");
  await studio.expectCssVariable("--background", "#282a36");
  await studio.expectCssVariable("--primary", "#bd93f9");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await studio.choose(settings.getByLabel("Theme"), "Omni");
  await studio.expectCssVariable("--background", "#191622");
  await studio.expectCssVariable("--primary", "#ff79c6");
  await expect(page.locator("html")).toHaveClass(/dark/);

  await studio.choose(settings.getByLabel("Theme"), "Light");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("a name that a built-in theme already has is refused", async ({ studio }) => {
  for (const name of ["Dracula", "Omni"]) {
    const { importing } = await startImport(studio, JSON.stringify({ name, type: "dark", colors: {} }));
    await importing.getByRole("button", { name: "Import" }).click();
    await expect(importing.getByText(/taken by a built-in theme/)).toBeVisible();
    await importing.getByRole("button", { name: "Cancel" }).click();
    await studio.dismissDialog();
  }
});
