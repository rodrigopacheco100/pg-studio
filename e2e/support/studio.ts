import { expect, type Locator, type Page } from "@playwright/test";

/** The seeded database (fixtures/seed.sql) as the backend container reaches it. */
export const DB = { host: "postgres", port: "5432", database: "shop", user: "e2e", password: "e2e-secret" };

/** The SSH server of the bastion container and the keys it generates (see docker/bastion). */
export const SSH = {
  host: "bastion",
  port: "22",
  user: "tunnel",
  password: "tunnel-secret",
  plainKey: "/keys/id_plain",
  protectedKey: "/keys/id_protected",
  passphrase: "key-secret",
};

export interface ConnectionForm {
  name: string;
  /** Store the database password (asks for a master password first, as there is no keychain). Default: no. */
  savePassword?: boolean;
  password?: string;
  /** Label of the environment option (e.g. "Production"). */
  environment?: string;
  ssh?: { auth: "key" | "password" | "agent"; keyPath?: string; secret?: string };
}

/**
 * Everything a test does goes through the app's interface, as a user would. These helpers only name the
 * recurring gestures (open a dialog, fill a form, type in the editor).
 */
export class Studio {
  constructor(readonly page: Page) {}

  async open() {
    await this.page.goto("/");
    await expect(this.sidebar.getByText("Connections", { exact: true })).toBeVisible();
  }

  get sidebar(): Locator {
    return this.page.locator("aside");
  }

  /** A dialog by its title. */
  dialog(name: string | RegExp): Locator {
    return this.page.getByRole("dialog", { name });
  }

  /** Fills the text prompt titled `title` and confirms it. */
  async answerPrompt(title: string, value: string) {
    const prompt = this.dialog(title);
    await prompt.locator("input").fill(value);
    await prompt.getByRole("button", { name: "OK" }).click();
  }

  async createMasterPassword(password: string) {
    const prompt = this.dialog("Create master password");
    await expect(prompt.getByText("Create master password")).toBeVisible();
    await prompt.locator("input").fill(password);
    await prompt.getByRole("button", { name: "OK" }).click();
    await expect(prompt.getByText("Repeat the master password")).toBeVisible();
    await prompt.locator("input").fill(password);
    await prompt.getByRole("button", { name: "OK" }).click();
    await expect(this.dialog("Create master password")).toBeHidden();
  }

  /** Opens the connection dialog, fills it and saves. With `savePassword` the master-password prompts follow. */
  async newConnection(c: ConnectionForm, afterSave?: () => Promise<void>) {
    await this.sidebar.getByTitle("New connection").click();
    const dialog = this.dialog("PostgreSQL connection");
    await dialog.getByLabel("Name", { exact: true }).fill(c.name);
    await dialog.getByLabel("Host", { exact: true }).fill(DB.host);
    await dialog.getByLabel("Port", { exact: true }).fill(DB.port);
    await dialog.getByLabel("Database", { exact: true }).fill(DB.database);
    if (c.environment) await this.choose(dialog.getByLabel("Environment"), c.environment);

    await dialog.getByRole("tab", { name: "Security" }).click();
    await dialog.getByLabel("User", { exact: true }).fill(DB.user);
    await dialog.getByLabel("Password", { exact: true }).fill(c.password ?? DB.password);
    const save = dialog.getByRole("checkbox", { name: /Save password/ });
    if (((await save.getAttribute("aria-checked")) === "true") !== (c.savePassword ?? false)) await save.click();

    if (c.ssh) {
      await dialog.getByRole("tab", { name: "SSH tunnel" }).click();
      await dialog.getByRole("checkbox", { name: "Connect through an SSH tunnel" }).click();
      await dialog.getByLabel("SSH host", { exact: true }).fill(SSH.host);
      await dialog.getByLabel("Port", { exact: true }).fill(SSH.port);
      await dialog.getByLabel("SSH user", { exact: true }).fill(SSH.user);
      await this.choose(dialog.getByLabel("Authentication"), { key: "Private key", password: "Password", agent: "SSH agent" }[c.ssh.auth]);
      if (c.ssh.auth === "key") await dialog.getByLabel("Private key file").fill(c.ssh.keyPath ?? SSH.plainKey);
      if (c.ssh.auth !== "agent" && c.ssh.secret) {
        await dialog.getByLabel(c.ssh.auth === "key" ? "Key passphrase (if any)" : "SSH password").fill(c.ssh.secret);
      }
    }

    await dialog.getByRole("button", { name: "Save" }).click();
    await afterSave?.();
    await expect(dialog).toBeHidden();
    await expect(this.connectionRow(c.name)).toBeVisible();
  }

  connectionRow(name: string): Locator {
    return this.sidebar.getByRole("listitem").filter({ hasText: name });
  }

  /** Clicks a saved connection; the caller answers any password prompt. */
  async clickConnection(name: string) {
    await this.connectionRow(name).first().click();
  }

  /**
   * Connects a connection that does not save its password, answering the prompt(s): the database password
   * and, for a tunnel with a password or a key, the SSH secret (`sshSecret`, empty for a key without passphrase).
   */
  async connect(name: string, opts: { password?: string; sshSecret?: string } = {}) {
    await this.clickConnection(name);
    await this.answerPrompt(name, opts.password ?? DB.password);
    if (opts.sshSecret !== undefined) {
      await expect(this.dialog(name)).toContainText(/SSH (password|key passphrase)/);
      await this.answerPrompt(name, opts.sshSecret);
    }
    await expect(this.sidebar.getByText("Tables", { exact: true })).toBeVisible();
  }

  /** The table entry of the sidebar tree. */
  table(name: string): Locator {
    return this.sidebar.getByText(name, { exact: true });
  }

  /** Types `sql` in the visible editor and runs it with Ctrl+Enter. */
  async run(sql: string) {
    const editor = this.page.locator(".cm-content:visible").first();
    await editor.click();
    await this.page.keyboard.press("Control+A");
    await this.page.keyboard.insertText(sql);
    await this.page.keyboard.press("Escape"); // closes the autocomplete popup, if any
    await this.page.keyboard.press("Control+Enter");
  }

  /** The data cells of the results grid (not the row-number column). */
  get cells(): Locator {
    return this.page.locator("td[data-c]");
  }

  /** Opens the results grid's filter bar (starting its first filter if there is none). */
  async openFilters() {
    await this.page.getByRole("button", { name: "Filter", exact: true }).click();
    await expect(this.page.getByLabel("Filter column")).toBeVisible();
  }

  /** Fills the `row`-th filter of the grid (0-based) from its column, operator and value. Nothing is searched yet. */
  async setFilter(row: number, f: { column?: string; op?: string; value?: string }) {
    const group = this.page.getByRole("group", { name: `Filter ${row + 1}`, exact: true });
    const field = (label: string) => group.getByLabel(label, { exact: true });
    if (f.column) await this.choose(field("Filter column"), f.column);
    if (f.op) await this.choose(field("Filter operator"), f.op);
    if (f.value !== undefined) await field("Filter value").fill(f.value);
  }

  /** Applies the filters of the bar. */
  async search() {
    await this.page.getByRole("button", { name: "Search", exact: true }).click();
  }

  /** Right-clicks the grid and starts exporting all its rows as `format` ("CSV", "JSON" or "SQL INSERT"). */
  async exportAs(format: string) {
    await this.cells.first().click({ button: "right" });
    await this.page.getByRole("menuitem", { name: "Export all rows" }).click();
    await this.page.getByRole("menuitem", { name: format, exact: true }).click();
  }

  /** The floating window of an export; `source` is `public.<table>`, or `Query results`. */
  exportWindow(source: string): Locator {
    return this.page.getByRole("dialog", { name: `Export ${source}`, exact: true });
  }

  /** The next "save as" dialog answers `path`, a path on the backend's filesystem (it writes the file). */
  async answerSaveDialog(path: string) {
    await this.page.evaluate((p) => ((window as unknown as { __E2E_SAVE_PATH: string }).__E2E_SAVE_PATH = p), path);
  }

  /** Text of a file on the backend's filesystem, read with the app's own `read_text_file` command. */
  async readBackendFile(path: string): Promise<string> {
    return this.page.evaluate(
      (p) => (window as unknown as { __TAURI_INTERNALS__: { invoke: (cmd: string, args: object) => Promise<string> } }).__TAURI_INTERNALS__.invoke("read_text_file", { path: p }),
      path,
    );
  }

  /** Closes the open dialog with Escape. */
  async dismissDialog() {
    await this.page.keyboard.press("Escape");
  }

  /** Opens the dropdown `field` (found by its label) and picks the option named `option`. */
  async choose(field: Locator, option: string) {
    await field.click();
    await this.page.getByRole("option", { name: option, exact: true }).click();
    await expect(this.page.getByRole("listbox")).toBeHidden(); // closed: a following Escape then reaches the dialog
  }

  /** The value of a CSS variable on the page's root element (e.g. a theme color). */
  async cssVariable(name: string): Promise<string> {
    return this.page.evaluate((n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), name);
  }

  /** Waits until the CSS variable `name` on the root element equals `value`. */
  async expectCssVariable(name: string, value: string) {
    await expect.poll(() => this.cssVariable(name)).toBe(value);
  }

  /** Picks `item` from the menu bar's `menu`. */
  async chooseMenu(menu: string, item: string) {
    await this.page.getByRole("menuitem", { name: menu, exact: true }).click();
    await this.page.getByRole("menuitem", { name: item }).click();
  }

  async openSettings(tab?: string) {
    await this.chooseMenu("Settings", "Preferences…");
    const dialog = this.dialog("Settings");
    if (tab) await dialog.getByRole("tab", { name: tab }).click();
    return dialog;
  }
}
