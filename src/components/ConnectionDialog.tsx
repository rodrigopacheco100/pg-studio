import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { api, errText } from "../api";
import { parseConnUrl } from "../lib/connUrl";
import type { Conn } from "../types";

interface Draft {
  id: number | null;
  name: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
}

const EMPTY: Draft = {
  id: null, name: "", host: "localhost", port: "5432", database: "postgres", user: "postgres", password: "", ssl: false,
};

const toDraft = (c: Conn): Draft => ({ ...c, port: String(c.port) });
const toConn = (d: Draft): Conn => ({
  ...d,
  name: d.name.trim(),
  host: d.host.trim(),
  database: d.database.trim(),
  user: d.user.trim(),
  port: Number(d.port),
});

interface Props {
  /** Conexão em edição; `null` cria uma nova. */
  initial: Conn | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ConnectionDialog({ initial, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(initial ? toDraft(initial) : EMPTY);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<{ text: string; kind: "" | "ok" | "error" }>({ text: "", kind: "" });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const text = (key: Exclude<keyof Draft, "id" | "ssl">) => ({
    id: `conn-${key}`,
    value: draft[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  function importUrl() {
    try {
      const c = parseConnUrl(url);
      setDraft((d) => ({ ...d, ...c, port: String(c.port), name: d.name || `${c.host}/${c.database}` }));
      setMsg({ text: "URL importada", kind: "ok" });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "URL inválida", kind: "error" });
    }
  }

  async function test() {
    setMsg({ text: "Testando…", kind: "" });
    try {
      await api.testConnection(toConn(draft));
      setMsg({ text: "Conexão OK", kind: "ok" });
    } catch (e) {
      setMsg({ text: errText(e), kind: "error" });
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.saveConnection(toConn(draft));
      onSaved();
    } catch (err) {
      setMsg({ text: errText(err), kind: "error" });
    }
  }

  const field = (key: Exclude<keyof Draft, "id" | "ssl">, label: string, props: React.ComponentProps<"input"> = {}) => (
    <div className="grid gap-1.5">
      <Label htmlFor={`conn-${key}`}>{label}</Label>
      <Input {...text(key)} {...props} />
    </div>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Conexão PostgreSQL</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="conn-url">Importar de URL</Label>
            <div className="flex gap-2">
              <Input
                id="conn-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="postgres://user:senha@host:5432/banco"
              />
              <Button type="button" variant="outline" onClick={importUrl}>Importar</Button>
            </div>
          </div>
          {field("name", "Nome", { required: true })}
          <div className="grid grid-cols-[1fr_6rem] gap-3">
            {field("host", "Host", { required: true })}
            {field("port", "Porta", { type: "number", required: true })}
          </div>
          {field("database", "Banco", { required: true })}
          <div className="grid grid-cols-2 gap-3">
            {field("user", "Usuário", { required: true })}
            {field("password", "Senha", { type: "password" })}
          </div>
          <Label className="gap-2 font-normal">
            <Checkbox checked={draft.ssl} onCheckedChange={(v) => set("ssl", v === true)} />
            Usar SSL (sem validar certificado)
          </Label>
          <p className={cn("selectable min-h-5 text-sm", msg.kind === "error" && "text-destructive", msg.kind === "ok" && "text-primary")}>
            {msg.text}
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={test}>Testar</Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button type="submit">Salvar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
