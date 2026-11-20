import { useEffect, useState } from "react";
import type { TaskiClient } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";
import type { Theme } from "../../theme.ts";
import { operationError } from "../access/use-team-session.ts";
import type { Access, Member } from "../access/use-team-session.ts";
import { WorkspaceIcon } from "../shared/marks.tsx";
import { TicketPanel } from "../tickets/ticket-panel.tsx";
import { useTicketRoute } from "../tickets/use-ticket-route.ts";
import { QuickCapture } from "./quick-capture.tsx";
import { useQuickCapture } from "./use-quick-capture.ts";
import { TicketList } from "./ticket-list.tsx";
import { useTicketList } from "./use-ticket-list.ts";
import { initialView, views } from "./views.ts";
import type { View } from "./views.ts";
import { WorkspaceSidebar, WorkspaceToolbar, WorkspaceTopbar } from "./workspace-chrome.tsx";

export function Workspace({ client, access, member, theme, onTheme, onExpired, onSignOut }: {
  client: TaskiClient; access: Access | undefined; member: Member | undefined;
  theme: Theme; onTheme: (theme: Theme) => void; onExpired: () => void; onSignOut: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<{ memberId: string; view: View }>();
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const view = selection && selection.memberId === member?.id ? selection.view : member ? initialView(member.id, access) : "team";
  const feedback = view === "feedback";
  const list = useTicketList(client, member?.id, view, area, onExpired);
  const route = useTicketRoute(client, member?.id, onExpired);
  const capture = useQuickCapture(client, feedback, area, (key) => { list.refresh(); void route.open(key); }, onExpired);
  const brand = list.project?.brand;
  const brandName = brand?.name ?? access?.brandName ?? "Taski";
  const projectName = list.project?.name ?? access?.projectName ?? brandName;
  const accentLight = brand?.accentLight;
  const accentDark = brand?.accentDark;

  useEffect(() => {
    if (!accentLight || !accentDark) return;
    const style = document.documentElement.style;
    style.setProperty("--accent-light", accentLight);
    style.setProperty("--accent-dark", accentDark);
    return () => { style.removeProperty("--accent-light"); style.removeProperty("--accent-dark"); };
  }, [accentLight, accentDark]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await onSignOut();
      route.reset();
      capture.reset();
      setSelection(undefined);
      setArea("");
      setSearch("");
    } catch (error) {
      setSignOutError(operationError(error, onExpired));
    } finally {
      setSigningOut(false);
    }
  }

  if (!member) return null;

  const error = signOutError || list.error;
  const heading = views.find(({ id }) => id === view)?.heading;
  return <div className="app" data-detail={route.selected ? "open" : undefined}>
    <WorkspaceSidebar brand={brandName} project={projectName} members={list.project?.members ?? access?.members ?? []}
      view={view} disabled={capture.busy || !!capture.attempt} onView={(next) => {
        setSelection({ memberId: member.id, view: next });
        capture.clearError();
      }} />
    <div className="app-center">
      <WorkspaceTopbar project={projectName} member={member} theme={theme} onTheme={onTheme}
        busy={signingOut || capture.busy} onSignOut={() => void signOut()} />
      <main className="workspace">
        <div className="workspace-heading">
          <h1>{heading}</h1>
          <Button variant="primary" disabled={capture.busy || !!capture.attempt} onClick={() => document.getElementById("capture-title")?.focus()}>
            <WorkspaceIcon name="plus" />{feedback ? "Dejar feedback" : "Nueva tarea"}
          </Button>
        </div>
        <WorkspaceToolbar search={search} onSearch={setSearch} areas={list.project?.areas ?? []}
          area={area} onArea={setArea} onRefresh={list.refresh} />
        <QuickCapture model={capture} feedback={feedback} />
        <TicketList rows={list.rows} feedback={feedback} project={list.project} selected={route.selected} search={search} onOpen={(key) => void route.open(key)} />
        {list.loading && <StatusMessage tone="loading" title="Cargando tickets…" />}
        {!list.loading && !list.rows.length && !error && <StatusMessage title={feedback ? "Todavía no hay feedback" : "No hay tickets en esta vista"} />}
        {error && <StatusMessage tone="error" title={error}>
          <Button onClick={signOutError ? () => void signOut() : list.refresh}>Reintentar</Button>
        </StatusMessage>}
        <footer className="workspace-footer">
          <span>{list.rows.length === 1 ? "1 entrada cargada" : `${list.rows.length} entradas cargadas`}</span>
          {list.hasMore && <Button disabled={list.loading} onClick={() => void list.more()}>Cargar más</Button>}
        </footer>
      </main>
    </div>
    <TicketPanel route={route} client={client} project={list.project} onSaved={list.refresh} />
  </div>;
}
