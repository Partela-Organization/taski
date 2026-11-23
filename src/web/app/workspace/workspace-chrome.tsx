import { Avatar, Button, Field } from "../../components.tsx";
import type { Theme } from "../../theme.ts";
import type { Member } from "../access/use-team-session.ts";
import { Wordmark, WorkspaceIcon } from "../shared/marks.tsx";
import { ThemeControl } from "../shared/theme-control.tsx";
import type { Presentation } from "./presentation.ts";
import { views } from "./views.ts";
import type { View } from "./views.ts";
import licenses from "../../assets/THIRD_PARTY_NOTICES.txt?url";

export function WorkspaceSidebar({ brand, project, members, view, disabled, onView }: {
  brand: string; project: string; members: Member[]; view: View; disabled: boolean; onView: (view: View) => void;
}) {
  return <aside className="app-sidebar">
    <Wordmark name={brand} />
    <p className="sidebar-project">{project}</p>
    <nav aria-label="Vistas">{views.map(({ id, label }) =>
      <Button key={id} aria-pressed={view === id} disabled={disabled} onClick={() => onView(id)}>
        <WorkspaceIcon name={id} />{label}
      </Button>)}</nav>
    <div className="sidebar-footer">
      {members.length > 0 && <>
        <p>Equipo · {members.length} personas</p>
        <div className="team-avatars">{members.map((person) => <Avatar key={person.id} name={person.name} />)}</div>
      </>}
      <a href={licenses}>Licencias</a>
    </div>
  </aside>;
}

export function WorkspaceTopbar({ project, member, theme, onTheme, busy, onSignOut }: {
  project: string; member: Member; theme: Theme; onTheme: (theme: Theme) => void; busy: boolean; onSignOut: () => void;
}) {
  return <header className="app-topbar">
    <span className="breadcrumb">Equipo <span aria-hidden="true">/</span> {project}</span>
    <div className="top-actions">
      <ThemeControl theme={theme} onChange={onTheme} />
      <span className="viewer"><Avatar name={member.name} />{member.name}</span>
      <Button variant="secondary" disabled={busy} onClick={onSignOut}>Salir</Button>
    </div>
  </header>;
}

export function WorkspaceToolbar({ search, onSearch, areas, area, onArea, onRefresh, presentation, onPresentation }: {
  search: string; onSearch: (search: string) => void;
  areas: { id: string; label: string }[]; area: string; onArea: (area: string) => void; onRefresh: () => void;
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
