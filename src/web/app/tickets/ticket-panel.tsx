import { useState } from "react";
import type { ProjectResult, TaskiClient } from "../../../client/index.ts";
import { Button, DetailPanel, Field, StatusMessage } from "../../components.tsx";
import { compactWidth } from "../shared/layout.ts";
import { TicketEditor } from "./ticket-editor.tsx";
import { ticketPath } from "./use-ticket-route.ts";
import type { useTicketRoute } from "./use-ticket-route.ts";

export function TicketPanel({ route, client, project, onSaved }: {
  route: ReturnType<typeof useTicketRoute>;
  client: TaskiClient;
  project: ProjectResult["project"];
  onSaved: () => void;
}) {
  const { selected, detail, error, close, open, drafts, conversations } = route;
  const [share, setShare] = useState<{ key: string; mode: "copied" | "manual" }>();
  const ticketUrl = selected ? `${location.origin}${ticketPath(selected)}` : "";
  const mode = share?.key === selected ? share?.mode : undefined;

  async function copyLink(key: string) {
    try { await navigator.clipboard.writeText(ticketUrl); setShare({ key, mode: "copied" }); }
    catch { setShare({ key, mode: "manual" }); }
  }

  return <DetailPanel open={!!selected} title={detail?.ticket.title ?? selected ?? "Detalle"}
    caption={selected ?? "Detalle"} compactAt={compactWidth} hideTitle={!!detail} showCloseLabel onClose={() => { setShare(undefined); close(); }}
    actions={detail && selected && <Button variant="secondary" onClick={() => void copyLink(selected)}>Copiar enlace</Button>}>
    {mode === "copied" && <StatusMessage title="Enlace copiado." />}
    {mode === "manual" && <Field label="Enlace del ticket" value={ticketUrl} readOnly onFocus={(event) => event.target.select()} />}
    {!detail && !error && <StatusMessage tone="loading" title="Cargando detalle…" />}
    {error && <StatusMessage tone="error" title={error}>
      <Button variant="secondary" onClick={() => selected && void open(selected)}>Reintentar detalle</Button>
    </StatusMessage>}
    {detail && <TicketEditor key={detail.ticket.key} initial={detail} project={project} client={client}
      drafts={drafts} conversations={conversations} onSaved={(fresh) => { if (fresh) route.syncDetail(fresh); onSaved(); }} />}
  </DetailPanel>;
}
