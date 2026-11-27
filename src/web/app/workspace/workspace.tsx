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
import { useTrackPlans } from "./use-track-plans.ts";
import { SummaryActions, SummaryView } from "../summary/summary-view.tsx";
import { useSummary } from "../summary/use-summary.ts";
import { SidebarTracks, TrackChips, TrackOverview } from "../summary/track-view.tsx";
import { GoTo, GoToButton } from "./go-to.tsx";
import type { GoToHandle } from "./go-to.tsx";
import { initialPlace, savePlace, trackFromPath, trackPath, views } from "./views.ts";
import type { Place, View } from "./views.ts";
import { FeedbackFilterControl, WorkspaceMobileAccount, WorkspaceSidebar, WorkspaceToolbar, WorkspaceTopbar } from "./workspace-chrome.tsx";

const emptyFeedback: Record<FeedbackFilter, string> = {
  open: "No hay feedback abierto", done: "Todavía no hay feedback hecho", all: "Todavía no hay feedback",
};

export function Workspace({ client, access, member, theme, onTheme, onExpired, onSignOut }: {
  client: TaskiClient; access: Access | undefined; member: Member | undefined;
  theme: Theme; onTheme: (theme: Theme) => void; onExpired: () => void; onSignOut: () => Promise<void>;
}) {
  const [selection, setSelection] = useState<Place & { memberId: string }>();
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
  const goTo = useRef<GoToHandle>(null);
  const compact = useCompactLayout();
  const place: Place = selection && selection.memberId === member?.id ? selection
    : member ? initialPlace(member.id, access) : { view: "team", trackId: "" };
  const { view, trackId } = place;
  const feedback = view === "feedback";
  const summaryView = view === "summary";
  const trackView = view === "track";
  const activeArea = feedback || summaryView ? "" : trackView ? trackId : area;
  const list = useTicketList(client, member?.id, view, activeArea, feedbackFilter, onExpired);
  const route = useTicketRoute(client, member?.id, onExpired);
  const trackPlans = useTrackPlans(client, member?.id, `${view}:${trackId}`);
  const summary = useSummary(client, member?.id, `${view}:${trackId}`, onExpired);
  const tracks = summary.summary?.tracks ?? [];
  const currentTrack = trackView ? tracks.find((entry) => entry.id === trackId) : undefined;
  const unknownTrack = trackView && !!summary.summary && !currentTrack;
  const plans = { ...trackPlans, client, onExpired, refresh: () => { trackPlans.refresh(); summary.refresh(); } };
  route.setBase(trackView ? trackPath(trackId) : "/");
  const feedbackDone = useFeedbackDone(client, (row, done) => {
    setDeletion(undefined);
    setNotice(done ? `«${row.title}» marcado como hecho.` : `«${row.title}» vuelve a estar abierto.`);
    list.refresh();
    summary.refresh();
    if (route.selected === row.key) {
      void client.getTicket(row.key, { view: "full", commentsLimit: 5 }).then(route.syncDetail, () => undefined);
    }
  }, onExpired);
  const capture = useQuickCapture(client, feedback, activeArea, (key) => {
    if (feedback) setComposingFeedback(false);
    setDeletion(undefined);
    list.refresh();
    summary.refresh();
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
      memberId: member.id, ...initialPlace(member.id, access),
    });
  }, [member, access]);

  // Back/forward between "/" and "/track/:areaId" follows the address bar. Ticket links keep the current place.
  useEffect(() => {
    if (!member) return;
    function follow() {
      const fromPath = trackFromPath(location.pathname);
      if (fromPath) setSelection({ memberId: member!.id, view: "track", trackId: fromPath });
      else if (location.pathname === "/") setSelection((current) => current?.view === "track" ? { memberId: member!.id, view: "summary", trackId: "" } : current);
    }
    window.addEventListener("popstate", follow);
    return () => window.removeEventListener("popstate", follow);
  }, [member]);

  useEffect(() => {
    if (member && selection?.memberId === member.id) savePlace(member.id, { view: selection.view, trackId: selection.trackId });
  }, [member, selection]);

  // Digits 1–9 open tracks in sidebar order, unless typing or a dialog is open.
  const shortcutTracks = useRef<string[]>([]);
  shortcutTracks.current = (summary.summary?.tracks ?? []).slice(0, 9).map((entry) => entry.id);
  const openTrack = useRef<(id: string) => void>(() => undefined);
  // ⌘K / Ctrl+K opens "Ir a…" from anywhere, including text fields.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
      if (document.querySelector("dialog[open]:not(.go-to)")) return;
      event.preventDefault();
      goTo.current?.open();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.metaKey || event.ctrlKey || event.altKey || !/^[1-9]$/.test(event.key)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']")) return;
      if (document.querySelector("dialog[open], [aria-modal='true']")) return;
      const id = shortcutTracks.current[Number(event.key) - 1];
      if (!id) return;
      event.preventDefault();
      openTrack.current(id);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

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
  const heading = trackView ? currentTrack?.label ?? list.project?.areas.find((entry) => entry.id === trackId)?.label ?? trackId
    : views.find(({ id }) => id === view)?.heading;
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
  const selectView = (next: View, nextArea = "") => {
    const nextTrack = next === "track" ? nextArea : "";
    setSelection({ memberId: member.id, view: next, trackId: nextTrack });
    const base = next === "track" ? trackPath(nextTrack) : "/";
    route.setBase(base);
    // An open ticket keeps its link; closing it returns to the new place.
    if (!route.selected && location.pathname !== base) history.pushState(null, "", base);
    if (next === "team") setArea(nextArea);
    capture.clearError();
    feedbackDone.clearError();
    setDeletion(undefined);
    setNotice("");
  };
  openTrack.current = (id) => { if (!capture.busy && !capture.recording && !capture.attempt) selectView("track", id); };
  return <div className="app" data-detail={route.selected ? "open" : undefined}>
    <WorkspaceSidebar brand={brandName} project={projectName} members={list.project?.members ?? access?.members ?? []}
      account={compact ? <><GoToButton compact onOpen={() => goTo.current?.open()} /><WorkspaceMobileAccount {...account} /></> : null}
      search={compact ? null : <GoToButton compact={false} onOpen={() => goTo.current?.open()} />}
      view={view} disabled={capture.busy || capture.recording || !!capture.attempt} onView={(next) => selectView(next, area)}
      tracks={!compact && <SidebarTracks tracks={tracks} active={trackView ? trackId : undefined}
        disabled={capture.busy || capture.recording || !!capture.attempt} onOpen={(id) => selectView("track", id)} />} />
    <div className="app-center">
      <header className="workspace-header">
        {!compact && <WorkspaceTopbar project={projectName} {...account} />}
        <McpGuide baseUrl={list.project?.baseUrl} memberId={member.id} />
      </header>
      <main className="workspace" data-view={view}>
        {trackView && tracks.length > 0 && <TrackChips tracks={tracks} active={trackId}
          onOpen={(id) => selectView("track", id)} onSummary={() => selectView("summary")} />}
        <div className="workspace-heading" data-feedback={feedback || undefined}>
          <h1 ref={workspaceHeading} tabIndex={-1}>{heading}</h1>
          {mobileFeedback && !composingFeedback && !capture.attempt &&
            <Button id="new-feedback" variant="primary" onClick={compose}>
              <WorkspaceIcon name="plus" />Nuevo feedback
            </Button>}
          {summaryView && <SummaryActions model={{ ...summary, refresh: () => { summary.refresh(); trackPlans.refresh(); } }} />}
          {!feedback && !summaryView && <Button variant="primary" disabled={capture.busy || !!capture.attempt} onClick={() => document.getElementById("capture-title")?.focus()}>
            <WorkspaceIcon name="plus" />Nueva tarea
          </Button>}
        </div>
        {deletion && <StatusMessage title={deletion.message} />}
        {notice && !deletion && <StatusMessage title={notice} />}
        {summaryView && signOutError && <StatusMessage tone="error" title={signOutError} />}
        {trackView && currentTrack && <TrackOverview track={currentTrack} plans={plans} />}
        {unknownTrack && <StatusMessage tone="error" title="Este track no está en la configuración de la instalación.">
          <Button variant="secondary" onClick={() => selectView("summary")}>Volver al resumen</Button>
        </StatusMessage>}
        {feedbackDone.error && <StatusMessage tone="error" title={feedbackDone.error}>
          <Button variant="secondary" onClick={() => { feedbackDone.clearError(); list.refresh(); }}>Actualizar lista</Button>
        </StatusMessage>}
        {summaryView && <SummaryView model={summary} project={list.project} navigation={{
          onOpenTrack: (areaId) => selectView("track", areaId),
          onOpenTicket: (key) => { setDeletion(undefined); void route.open(key); },
          onReview: () => selectView("review"),
          onFeedback: () => selectView("feedback"),
        }} />}
        {!summaryView && !unknownTrack && <>
        {!feedback && !trackView && <WorkspaceToolbar search={search} onSearch={setSearch} areas={list.project?.areas ?? []}
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
          plans={feedback || trackView ? undefined : plans} hideArea={trackView}
          search={feedback || trackView ? "" : search} presentation={trackView ? "list" : presentation}
          grouping={trackView ? "status" : grouping} onOpen={(key) => {
            setDeletion(undefined);
            void route.open(key);
          }} />
        {list.loading && <StatusMessage tone="loading" title="Cargando tickets…" />}
        {!list.loading && !list.rows.length && !error && <StatusMessage title={feedback ? emptyFeedback[feedbackFilter] : "No hay tickets en esta vista"} />}
        {error && <StatusMessage tone="error" title={error}>
          <Button variant="secondary" onClick={signOutError ? () => void signOut() : () => { list.refresh(); trackPlans.refresh(); }}>Reintentar</Button>
        </StatusMessage>}
        {(!feedback || list.hasMore) && <footer className="workspace-footer" data-more={list.hasMore || undefined}>
          <div hidden={feedback}>
            <span>{list.rows.length === 1 ? "1 entrada cargada" : `${list.rows.length} entradas cargadas`}</span>
            {list.rows.length > 0 && <span className="workspace-order">Más recientes primero</span>}
          </div>
          {list.hasMore && <Button variant="secondary" disabled={list.loading} onClick={() => void list.more()}>Cargar más</Button>}
        </footer>}
        </>}
      </main>
    </div>
    <GoTo ref={goTo} client={client} tracks={tracks} project={list.project} onExpired={onExpired}
      onTrack={(id) => selectView("track", id)} onTicket={(key) => { setDeletion(undefined); void route.open(key); }} />
    <TicketPanel route={route} client={client} project={list.project} onSaved={() => { list.refresh(); summary.refresh(); }} onExpired={onExpired}
      onDeleted={(type, closed) => {
        setDeletion({ message: type === "feedback" ? "Feedback eliminado." : "Tarea eliminada.", closed });
        list.refresh();
        summary.refresh();
      }} />
  </div>;
}
