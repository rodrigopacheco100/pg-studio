import { Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, errText } from "@/api";
import { useDialogs } from "@/hooks/useDialogs";
import type { KnownHost } from "@/types";

/** SSH servers trusted on first use. Forgetting one makes the next connection trust its key again. */
export function KnownHostsList() {
  const dialogs = useDialogs();
  const [hosts, setHosts] = useState<KnownHost[] | null>(null);
  const load = useCallback(() => api.listKnownHosts().then(setHosts, (e) => void dialogs.alert(errText(e))), [dialogs]);
  useEffect(() => void load(), [load]);

  async function forget(host: KnownHost) {
    const ok = await dialogs.confirm(
      `Forget ${host.server}? The next connection through it will trust whatever key the server presents, so only do this if you know the key changed on purpose.`,
      { title: "Forget SSH server", confirmLabel: "Forget" },
    );
    if (!ok) return;
    await api.forgetKnownHost(host.server).then(load, (e) => dialogs.alert(errText(e)));
  }

  return (
    <div className="space-y-1.5">
      <div className="text-sm font-medium">Known SSH servers</div>
      <div className="rounded-md border">
        {hosts?.length === 0 && <div className="p-3 text-sm text-muted-foreground">None yet. Servers are added the first time you connect through them.</div>}
        {hosts?.map((h) => (
          <div key={h.server} className="flex items-center gap-2 border-b px-3 py-2 last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{h.server}</div>
              <div className="selectable truncate font-mono text-xs text-muted-foreground" title={h.fingerprint}>{h.fingerprint}</div>
            </div>
            <Button variant="ghost" size="icon-xs" title="Forget" onClick={() => void forget(h)}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
