import { Avatar, Button, Field } from "../../components.tsx";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type { Theme } from "../../theme.ts";
import type { Member } from "../access/use-team-session.ts";
import { Wordmark, WorkspaceIcon } from "../shared/marks.tsx";
import { ThemeControl } from "../shared/theme-control.tsx";
import type { FeedbackFilter, Grouping, Presentation } from "./presentation.ts";
import { views } from "./views.ts";
import type { NavigationView, View } from "./views.ts";
import licenses from "../../assets/THIRD_PARTY_NOTICES.txt?url";

export function WorkspaceSidebar({ brand, project, members, view, disabled, onView, account, tracks }: {
  brand: string; project: string; members: Member[]; view: View; disabled: boolean; onView: (view: NavigationView) => void;
  account?: ReactNode; tracks?: ReactNode;
}) {
  return <aside className="app-sidebar">
    <div className="sidebar-heading"><Wordmark name={brand} />{account}</div>
    <p className="sidebar-project">{project}</p>
    <nav aria-label="Vistas">{views.map(({ id, label }) =>
      <Button key={id} aria-pressed={view === id} disabled={disabled} onClick={() => onView(id)}>
        <WorkspaceIcon name={id} />{label}
      </Button>)}</nav>
    {tracks}
    <div className="sidebar-footer">
      {members.length > 0 && <>
        <p>Equipo · {members.length} personas</p>
        <div className="team-avatars">{members.map((person) => <Avatar key={person.id} name={person.name} />)}</div>
      </>}
      <a href={licenses}>Licencias</a>
    </div>
  </aside>;
}

interface AccountActions {
  member: Member; theme: Theme; onTheme: (theme: Theme) => void; busy: boolean; onSignOut: () => void;
}

export function WorkspaceMobileAccount({ member, theme, onTheme, busy, onSignOut }: AccountActions) {
  const menu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (menu.current?.open && event.target instanceof Node && !menu.current.contains(event.target)) menu.current.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);
  return <details ref={menu} className="mobile-account" onKeyDown={(event) => {
    if (event.key !== "Escape" || !event.currentTarget.open) return;
    event.preventDefault();
    event.currentTarget.open = false;
    event.currentTarget.querySelector("summary")?.focus();
  }}>
    <summary aria-label={`Cuenta de ${member.name}`}>
      <Avatar name={member.name} /><span>{member.name}</span><WorkspaceIcon name="chevron" />
    </summary>
    <div className="mobile-account__actions">
      <ThemeControl theme={theme} onChange={onTheme} />
      <Button variant="secondary" disabled={busy} onClick={onSignOut}>Salir</Button>
    </div>
  </details>;
}

export function WorkspaceTopbar({ project, member, theme, onTheme, busy, onSignOut }: AccountActions & { project: string }) {
  return <div className="app-topbar">
    <span className="breadcrumb">Equipo <span aria-hidden="true">/</span> {project}</span>
    <div className="top-actions">
      <ThemeControl theme={theme} onChange={onTheme} />
      <span className="viewer"><Avatar name={member.name} />{member.name}</span>
      <Button variant="secondary" disabled={busy} onClick={onSignOut}>Salir</Button>
    </div>
  </div>;
}

export function WorkspaceToolbar({ search, onSearch, areas, area, onArea, onRefresh, grouping, onGrouping, presentation, onPresentation }: {
  search: string; onSearch: (search: string) => void;
  areas: { id: string; label: string }[]; area: string; onArea: (area: string) => void; onRefresh: () => void;
  grouping: Grouping; onGrouping: (grouping: Grouping) => void;
  presentation: Presentation; onPresentation: (presentation: Presentation) => void;
}) {
  return <div className="workspace-toolbar">
    <div className="workspace-filters">
      <div className="workspace-search"><WorkspaceIcon name="search" />
        <Field label="Buscar entre los tickets cargados" placeholder="Buscar…" type="search" value={search} onChange={(event) => onSearch(event.target.value)} />
      </div>
      <div className="workspace-area">
        <label htmlFor="area">Área</label>
        <select id="area" value={area} onChange={(event) => onArea(event.target.value)}>
          <option value="">Todas las áreas</option>
          {areas.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
        </select>
      </div>
    </div>
    <div className="workspace-actions">
      <div className="workspace-grouping">
        <label htmlFor="ticket-grouping">Agrupar por</label>
        <select id="ticket-grouping" value={grouping} onChange={(event) => onGrouping(event.target.value === "status" ? "status" : "area")}>
          <option value="area">Por área</option>
          <option value="status">Por estado</option>
        </select>
      </div>
      <div className="presentation-control" role="group" aria-label="Presentación">
        <Button aria-pressed={presentation === "list"} onClick={() => onPresentation("list")}>
          <WorkspaceIcon name="list" />Lista
        </Button>
        <Button aria-pressed={presentation === "cards"} onClick={() => onPresentation("cards")}>
          <WorkspaceIcon name="team" />Tarjetas
        </Button>
      </div>
      <Button variant="secondary" className="refresh-list" aria-label="Actualizar lista" onClick={onRefresh}>
        <WorkspaceIcon name="refresh" />Actualizar
      </Button>
    </div>
  </div>;
}

const feedbackFilters = [
  { id: "open", label: "Abiertos" }, { id: "done", label: "Hechos" }, { id: "all", label: "Todos" },
] as const;

export function FeedbackFilterControl({ filter, onFilter }: { filter: FeedbackFilter; onFilter: (filter: FeedbackFilter) => void }) {
  return <div className="presentation-control feedback-filter" role="group" aria-label="Mostrar feedback">
    {feedbackFilters.map(({ id, label }) =>
      <Button key={id} aria-pressed={filter === id} onClick={() => onFilter(id)}>{label}</Button>)}
  </div>;
}
