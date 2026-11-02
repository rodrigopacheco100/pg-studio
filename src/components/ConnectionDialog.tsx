import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { api, errText, pickKeyFile } from "../api";
import { PasswordInput } from "./PasswordInput";
import { ENVIRONMENTS } from "../lib/environments";
import { useVault } from "../hooks/useVault";
import { parseConnUrl } from "../lib/connUrl";
import type { Conn } from "../types";

type TextKey = "name" | "host" | "port" | "database" | "user" | "password" | "ssh_host" | "ssh_port" | "ssh_user" | "ssh_key_path" | "ssh_secret";

interface Draft {
  id: number | null;
  name: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  folder_id: number | null;
  save_password: boolean;
  environment: Conn["environment"];
  ssh_enabled: boolean;
  ssh_host: string;
  ssh_port: string;
  ssh_user: string;
  ssh_auth: Conn["ssh_auth"];
  ssh_key_path: string;
  ssh_secret: string;
}

const EMPTY: Draft = {
  id: null, name: "", host: "localhost", port: "5432", database: "postgres", user: "postgres", password: "", ssl: false, folder_id: null, save_password: true, environment: "",
  ssh_enabled: false, ssh_host: "", ssh_port: "22", ssh_user: "", ssh_auth: "key", ssh_key_path: "", ssh_secret: "",
};

const toDraft = (c: Conn): Draft => ({ ...c, port: String(c.port), ssh_port: String(c.ssh_port) });
const toConn = (d: Draft): Conn => ({
  ...d,
  name: d.name.trim(),
  host: d.host.trim(),
  database: d.database.trim(),
  user: d.user.trim(),
  port: Number(d.port),
  ssh_host: d.ssh_host.trim(),
  ssh_user: d.ssh_user.trim(),
  ssh_port: Number(d.ssh_port),
});

interface Props {
  /** Connection being edited; `null` creates a new one. */
  initial: Conn | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ConnectionDialog({ initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(initial ? toDraft(initial) : EMPTY);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ text: string; kind: "" | "ok" | "error" }>({ text: "", kind: "" });

  type TabName = "general" | "security" | "ssh";
  const [tab, setTab] = useState<TabName>("general");
  const ensureVault = useVault();
  /** Why there is no system keychain (`null` = there is one); `undefined` while checking. */
  const [keychainProblem, setKeychainProblem] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    api.vaultStatus().then((s) => setKeychainProblem(s.keychainProblem), () => setKeychainProblem(null));
  }, []);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const text = (key: TextKey) => ({
    id: `conn-${key}`,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  function importUrl() {
    try {
      const c = parseConnUrl(url);
      setDraft((d) => ({ ...d, ...c, port: String(c.port), name: d.name || `${c.host}/${c.database}` }));
      setMsg({ text: "URL imported", kind: "ok" });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Invalid URL", kind: "error" });
    }
  }

  async function test() {
    // A blank password on a saved connection is tested with the stored one, which may need the vault open.
    if (draft.save_password && initial?.id != null && (!draft.password || !draft.ssh_secret) && !(await ensureVault())) return;
    setMsg({ text: "Testing…", kind: "" });
    try {
      await api.testConnection(toConn(draft));
      setMsg({ text: "Connection OK", kind: "ok" });
    } catch (e) {
      setMsg({ text: errText(e), kind: "error" });
    }
  }

  /** Required fields live in different tabs, so the browser's own validation cannot see them all. */
  function firstMissing(): [TabName, string] | null {
    const needs: [TabName, string, boolean][] = [
      ["general", "Name", !draft.name.trim()],
      ["general", "Host", !draft.host.trim()],
      ["general", "Port", !draft.port],
      ["general", "Database", !draft.database.trim()],
      ["security", "User", !draft.user.trim()],
      ["ssh", "SSH host", draft.ssh_enabled && !draft.ssh_host.trim()],
      ["ssh", "SSH port", draft.ssh_enabled && !draft.ssh_port],
      ["ssh", "SSH user", draft.ssh_enabled && !draft.ssh_user.trim()],
      ["ssh", "Private key file", draft.ssh_enabled && draft.ssh_auth === "key" && !draft.ssh_key_path.trim()],
    ];
    const missing = needs.find(([, , empty]) => empty);
    return missing ? [missing[0], missing[1]] : null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing = firstMissing();
    if (missing) {
      setTab(missing[0]);
      setMsg({ text: `${missing[1]} is required`, kind: "error" });
      return;
    }
    if (draft.save_password && (draft.password || draft.ssh_secret) && !(await ensureVault())) return;
    try {
      await api.saveConnection(toConn(draft));
      onSaved();
    } catch (err) {
      setMsg({ text: errText(err), kind: "error" });
    }
  }

  const field = (key: TextKey, label: string, props: React.ComponentProps<"input"> = {}) => {
    const { type: _type, ...rest } = props;
    return (
    <div className="grid gap-1.5">
      <Label htmlFor={`conn-${key}`}>{label}</Label>
      {props.type === "password" ? <PasswordInput {...text(key)} {...rest} /> : <Input {...text(key)} {...props} />}
    </div>
    );
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>PostgreSQL connection</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabName)}>
            <TabsList variant="line">
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="ssh">SSH tunnel</TabsTrigger>
            </TabsList>
            <TabsContent value="general" className="grid min-h-72 content-start gap-3 pt-2">
            <div className="grid gap-1.5">
              <Label htmlFor="conn-url">Import from URL</Label>
              <div className="flex gap-2">
                <Input
                  id="conn-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="postgres://user:password@host:5432/database"
                />
                <Button type="button" variant="outline" onClick={importUrl}>Importar</Button>
              </div>
            </div>
            {field("name", "Name", {})}
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              {field("host", "Host", {})}
              {field("port", "Port", { type: "number" })}
            </div>
            {field("database", "Database", {})}
              <div className="grid gap-1.5">
                <Label htmlFor="conn-environment">Environment</Label>
                <select
                  id="conn-environment"
                  value={draft.environment}
                  onChange={(e) => set("environment", e.target.value as Draft["environment"])}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                >
                  <option value="">Not specified</option>
                  {ENVIRONMENTS.map((env) => <option key={env.id} value={env.id}>{env.label}</option>)}
                </select>
              </div>
            </TabsContent>
            <TabsContent value="security" className="grid min-h-72 content-start gap-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              {field("user", "User", {})}
              {field("password", "Password", {
                type: "password",
                autoComplete: "new-password",
                placeholder: initial?.id != null && draft.save_password ? "Leave blank to keep" : "",
              })}
            </div>
            <Tooltip open={keychainProblem ? undefined : false}>
              <TooltipTrigger asChild>
                <Label className="w-fit gap-2 font-normal">
                  <Checkbox checked={draft.save_password} onCheckedChange={(v) => set("save_password", v === true)} />
                  Save password (otherwise it is asked on each connect)
                </Label>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                No system keychain here ({keychainProblem}). The password is stored encrypted with a master password.
              </TooltipContent>
            </Tooltip>
            <Label className="gap-2 font-normal">
              <Checkbox checked={draft.ssl} onCheckedChange={(v) => set("ssl", v === true)} />
              Usar SSL (sem validar certificado)
            </Label>
            </TabsContent>
            <TabsContent value="ssh" className="grid min-h-72 content-start gap-3 pt-2">
            <Label className="gap-2 font-normal">
              <Checkbox checked={draft.ssh_enabled} onCheckedChange={(v) => set("ssh_enabled", v === true)} />
              Connect through an SSH tunnel
            </Label>
            {draft.ssh_enabled && (
              <div className="grid gap-3 rounded-md border p-3">
                <div className="grid grid-cols-[1fr_6rem] gap-3">
                  {field("ssh_host", "SSH host", {})}
                  {field("ssh_port", "Port", { type: "number" })}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {field("ssh_user", "SSH user", {})}
                  <div className="grid gap-1.5">
                    <Label htmlFor="conn-ssh_auth">Authentication</Label>
                    <select
                      id="conn-ssh_auth"
                      value={draft.ssh_auth}
                      onChange={(e) => set("ssh_auth", e.target.value as Draft["ssh_auth"])}
                      className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
                    >
                      <option value="key">Private key</option>
                      <option value="password">Password</option>
                      <option value="agent">SSH agent</option>
                    </select>
                  </div>
                </div>
                {draft.ssh_auth === "key" && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="conn-ssh_key_path">Private key file</Label>
                    <div className="flex gap-2">
                      <Input {...text("ssh_key_path")} placeholder="~/.ssh/id_ed25519" />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          const path = await pickKeyFile();
                          if (path) set("ssh_key_path", path);
                        }}
                      >
                        Browse
                      </Button>
                    </div>
                  </div>
                )}
                {draft.ssh_auth !== "agent" &&
                  field("ssh_secret", draft.ssh_auth === "key" ? "Key passphrase (if any)" : "SSH password", {
                    type: "password",
                    autoComplete: "new-password",
                    placeholder: initial?.id != null && draft.save_password ? "Leave blank to keep" : "",
                  })}
              </div>
            )}
            </TabsContent>
          </Tabs>
          <p className={cn("selectable min-h-5 text-sm", msg.kind === "error" && "text-destructive", msg.kind === "ok" && "text-primary")}>
            {msg.text}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={test}>Test</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit">Save</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
