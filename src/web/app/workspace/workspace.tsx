import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { TaskiClient } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";
import type { Theme } from "../../theme.ts";
import { operationError } from "../access/use-team-session.ts";
import type { Access, Member } from "../access/use-team-session.ts";
import { McpGuide } from "../mcp/mcp-guide.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";
import { useCompactLayout } from "../shared/layout.ts";
import { TicketPanel } from "../tickets/ticket-panel.tsx";
import { useTicketRoute } from "../tickets/use-ticket-route.ts";
import { readFeedbackFilter, readGrouping, readPresentation, saveFeedbackFilter, saveGrouping, savePresentation } from "./presentation.ts";
import type { FeedbackFilter } from "./presentation.ts";
import { QuickCapture } from "./quick-capture.tsx";
import { useFeedbackDone } from "./use-feedback-done.ts";
import { useQuickCapture } from "./use-quick-capture.ts";
import { TicketList } from "./ticket-list.tsx";
import { useTicketList } from "./use-ticket-list.ts";
import { initialView, views } from "./views.ts";
import type { View } from "./views.ts";
import { FeedbackFilterControl, WorkspaceMobileAccount, WorkspaceSidebar, WorkspaceToolbar, WorkspaceTopbar } from "./workspace-chrome.tsx";

const emptyFeedback: Record<FeedbackFilter, string> = {
  open: "No hay feedback abierto", done: "Todavía no hay feedback hecho", all: "Todavía no hay feedback",
};

export function Workspace({ client, access, member, theme, onTheme, onExpired, onSignOut }: {
  client: TaskiClient; access: Access | undefined; member: Member | undefined;
  theme: Theme; onTheme: (theme: Theme) => void; onExpired: () => void; onSignOut: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<{ memberId: string; view: View }>();
  const [area, setArea] = useState("");
  const [search, setSearch] = useState("");
  const [presentation, setPresentation] = useState(readPresentation);
  const [grouping, setGrouping] = useState(readGrouping);
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>(readFeedbackFilter);
  const [notice, setNotice] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const [composingFeedback, setComposingFeedback] = useState(false);
  const [deletion, setDeletion] = useState<{ message: string; closed: boolean }>();
  const workspaceHeading = useRef<HTMLHeadingElement>(null);
  const compact = useCompactLayout();
  const view = selection && selection.memberId === member?.id ? selection.view : member ? initialView(member.id, access) : "team";
  const feedback = view === "feedback";
  const activeArea = feedback ? "" : area;
  const list = useTicketList(client, member?.id, view, activeArea, feedbackFilter, onExpired);
  const route = useTicketRoute(client, member?.id, onExpired);
  const feedbackDone = useFeedbackDone(client, (row, done) => {
    setDeletion(undefined);
    setNotice(done ? `«${row.title}» marcado como hecho.` : `«${row.title}» vuelve a estar abierto.`);
    list.refresh();
    if (route.selected === row.key) {
      void client.getTicket(row.key, { view: "full", commentsLimit: 5 }).then(route.syncDetail, () => undefined);
    }
  }, onExpired);
  const capture = useQuickCapture(client, feedback, activeArea, (key) => {
    if (feedback) setComposingFeedback(false);
    setDeletion(undefined);
    list.refresh();
    void route.open(key);
  }, onExpired);
  const brand = list.project?.brand;
  const brandName = brand?.name ?? access?.brandName ?? "Taski";
  const projectName = list.project?.name ?? access?.projectName ?? brandName;
  const accentLight = brand?.accentLight;
  const accentDark = brand?.accentDark;

  useEffect(() => {
    if (deletion?.closed) workspaceHeading.current?.focus({ preventScroll: true });
  }, [deletion]);

  useEffect(() => {
    if (!member) return;
    setSelection((current) => current?.memberId === member.id ? current : {
      memberId: member.id, view: initialView(member.id, access),
    });
  }, [member, access]);

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
      setComposingFeedback(false);
      setArea("");
      setSearch("");
      setDeletion(undefined);
      setNotice("");
      feedbackDone.reset();
    } catch (error) {
      setSignOutError(operationError(error, onExpired));
    } finally {
      setSigningOut(false);
    }
  }

  if (!member) return null;

  const error = signOutError || list.error;
  const heading = views.find(({ id }) => id === view)?.heading;
  const mobileFeedback = compact && feedback;
  const compose = () => {
    flushSync(() => setComposingFeedback(true));
    document.getElementById("capture-title")?.focus();
  };
  const cancelFeedback = () => {
    flushSync(() => setComposingFeedback(false));
    document.getElementById("new-feedback")?.focus();
  };
  const account = { member, theme, onTheme, busy: signingOut || capture.busy || capture.recording, onSignOut: () => void signOut() };
  return <div className="app" data-detail={route.selected ? "open" : undefined}>
    <WorkspaceSidebar brand={brandName} project={projectName} members={list.project?.members ?? access?.members ?? []}
      account={compact ? <WorkspaceMobileAccount {...account} /> : null}
      view={view} disabled={capture.busy || capture.recording || !!capture.attempt} onView={(next) => {
        setSelection({ memberId: member.id, view: next });
        capture.clearError();
        feedbackDone.clearError();
        setDeletion(undefined);
        setNotice("");
      }} />
    <div className="app-center">
      <header className="workspace-header">
        {!compact && <WorkspaceTopbar project={projectName} {...account} />}
        <McpGuide baseUrl={list.project?.baseUrl} memberId={member.id} />
      </header>
      <main className="workspace" data-view={view}>
        <div className="workspace-heading" data-feedback={feedback || undefined}>
          <h1 ref={workspaceHeading} tabIndex={-1}>{heading}</h1>
          {mobileFeedback && !composingFeedback && !capture.attempt &&
            <Button id="new-feedback" variant="primary" onClick={compose}>
              <WorkspaceIcon name="plus" />Nuevo feedback
            </Button>}
          {!feedback && <Button variant="primary" disabled={capture.busy || !!capture.attempt} onClick={() => document.getElementById("capture-title")?.focus()}>
            <WorkspaceIcon name="plus" />Nueva tarea
          </Button>}
        </div>
        {deletion && <StatusMessage title={deletion.message} />}
        {notice && !deletion && <StatusMessage title={notice} />}
        {feedbackDone.error && <StatusMessage tone="error" title={feedbackDone.error}>
          <Button variant="secondary" onClick={() => { feedbackDone.clearError(); list.refresh(); }}>Actualizar lista</Button>
        </StatusMessage>}
        {!feedback && <WorkspaceToolbar search={search} onSearch={setSearch} areas={list.project?.areas ?? []}
          area={area} onArea={setArea} onRefresh={list.refresh} grouping={grouping} onGrouping={(next) => {
            setGrouping(next);
            saveGrouping(next);
          }} presentation={presentation} onPresentation={(next) => {
            setPresentation(next);
            savePresentation(next);
          }} />}
        {(!mobileFeedback || composingFeedback || capture.attempt) &&
          <QuickCapture model={capture} feedback={feedback} onCancel={mobileFeedback ? cancelFeedback : undefined} />}
        {feedback && <FeedbackFilterControl filter={feedbackFilter} onFilter={(next) => {
          setFeedbackFilter(next);
          saveFeedbackFilter(next);
          setNotice("");
          feedbackDone.clearError();
        }} />}
        <TicketList key={`${view}:${activeArea}`} rows={list.rows} feedback={feedback} project={list.project} selected={route.selected}
          onToggleDone={feedback ? (row) => void feedbackDone.toggle(row) : undefined} pendingDone={feedbackDone.pending}
          search={feedback ? "" : search} presentation={presentation} grouping={grouping} onOpen={(key) => {
            setDeletion(undefined);
            void route.open(key);
          }} />
        {list.loading && <StatusMessage tone="loading" title="Cargando tickets…" />}
        {!list.loading && !list.rows.length && !error && <StatusMessage title={feedback ? emptyFeedback[feedbackFilter] : "No hay tickets en esta vista"} />}
        {error && <StatusMessage tone="error" title={error}>
          <Button variant="secondary" onClick={signOutError ? () => void signOut() : list.refresh}>Reintentar</Button>
        </StatusMessage>}
        {(!feedback || list.hasMore) && <footer className="workspace-footer" data-more={list.hasMore || undefined}>
          <div hidden={feedback}>
            <span>{list.rows.length === 1 ? "1 entrada cargada" : `${list.rows.length} entradas cargadas`}</span>
            {list.rows.length > 0 && <span className="workspace-order">Más recientes primero</span>}
          </div>
          {list.hasMore && <Button variant="secondary" disabled={list.loading} onClick={() => void list.more()}>Cargar más</Button>}
        </footer>}
      </main>
    </div>
    <TicketPanel route={route} client={client} project={list.project} onSaved={list.refresh} onExpired={onExpired}
      onDeleted={(type, closed) => {
        setDeletion({ message: type === "feedback" ? "Feedback eliminado." : "Tarea eliminada.", closed });
        list.refresh();
      }} />
  </div>;
}
