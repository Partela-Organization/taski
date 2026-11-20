import { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { TaskiClient, TaskiClientError } from "../../client/index.ts";
import type { CreateTicket, ProjectResult, TicketResult, WorkSummary } from "../../client/index.ts";
import { Button, DetailPanel, Field, StatusMessage } from "../components.tsx";
import { applyTheme, readTheme } from "../theme.ts";
import licenses from "../assets/THIRD_PARTY_NOTICES.txt?url";
import "../styles/tokens.css";
import "../styles/components.css";
import "./style.css";

const client = new TaskiClient({ baseUrl: location.origin, clientName: "taski-web" });
type Member = { id: string; name: string };
type Access = Awaited<ReturnType<TaskiClient["accessOptions"]>>;
function App() {
  const [access, setAccess] = useState<Access>();
  const [member, setMember] = useState<Member>();
  const [person, setPerson] = useState(""); const [code, setCode] = useState("");
  const [project, setProject] = useState<ProjectResult["project"]>();
  const [view, setView] = useState("team"), [area, setArea] = useState(""), [search, setSearch] = useState("");
  const [rows, setRows] = useState<WorkSummary[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [ready, setReady] = useState(false);
  const [error, setError] = useState(""), [captureError, setCaptureError] = useState("");
  const [title, setTitle] = useState(""), [attempt, setAttempt] = useState<CreateTicket>();
  const [selected, setSelected] = useState<string>(), [detail, setDetail] = useState<TicketResult<"full">>();
  const [detailError, setDetailError] = useState(""); const [refresh, setRefresh] = useState(0);
  const generation = useRef(0), detailGeneration = useRef(0);
  const close = useCallback(() => { detailGeneration.current++; setSelected(undefined); setDetail(undefined); }, []);
  const fail = (e: unknown) => {
    if (e instanceof TaskiClientError && e.status === 401) { generation.current++; setMember(undefined); setRows([]); setProject(undefined); close(); }
    return e instanceof TaskiClientError && e.status === 401 ? "La sesión terminó. Vuelve a entrar." : "No se pudo confirmar la operación. Puedes volver a intentarlo.";
  };
  useEffect(() => {
    applyTheme(readTheme());
    void Promise.all([client.accessOptions(), client.session().catch((e: unknown) => {
      if (e instanceof TaskiClientError && e.status === 401) return undefined;
      throw e;
    })]).then(([options, session]) => { setAccess(options); setPerson(options.members[0]?.id ?? ""); setMember(session?.member); })
      .catch((e: unknown) => setError(fail(e))).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!member) return;
    const id = ++generation.current;
    setRows([]); setCursor(null); setLoading(true); setError("");
    void Promise.all([client.getProject(), client.listTickets({ view: "work", limit: 20, type: "task",
      ...(view === "mine" ? { assigneeId: member.id } : {}), ...(view === "review" ? { status: "in_review" as const } : {}), ...(area ? { areaId: area } : {}) })])
      .then(([config, page]) => { if (id === generation.current) { setProject(config.project); setRows(page.items); setCursor(page.nextCursor); } })
      .catch((e: unknown) => { if (id === generation.current) setError(fail(e)); })
      .finally(() => { if (id === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [member, view, area, refresh]);
  async function open(key: string) {
    const id = ++detailGeneration.current; setSelected(key); setDetail(undefined); setDetailError("");
    try { const result = await client.getTicket(key, { view: "full", commentsLimit: 5 }); if (id === detailGeneration.current) setDetail(result); }
    catch (e) { if (id === detailGeneration.current) setDetailError(fail(e)); }
  }
  async function more() {
    if (!cursor || loading) return;
    const id = generation.current; setLoading(true); setError("");
    try { const page = await client.listTickets({ view: "work", limit: 20, cursor });
      if (id === generation.current) { setRows((old) => [...old, ...page.items.filter((row) => !old.some((r) => r.key === row.key))]); setCursor(page.nextCursor); }
    } catch (e) { if (id === generation.current) setError(fail(e)); }
    finally { if (id === generation.current) setLoading(false); }
  }
  return <main className="app"><header><strong>{access?.brandName ?? "Taski"}</strong>{member && <><span>{member.name}</span><Button disabled={busy} onClick={() => {
    setBusy(true); void client.logout().then(() => { setMember(undefined); setRows([]); setProject(undefined); close(); setAttempt(undefined); setTitle(""); }).catch((e: unknown) => setError(fail(e))).finally(() => setBusy(false));
  }}>Salir</Button></>}</header>
    {!ready ? <StatusMessage tone="loading" title="Conectando…" /> : !member ? <form className="login" onSubmit={(e) => {
      e.preventDefault(); if (busy) return; setBusy(true); setError("");
      void client.login(code, person).then((s) => { setCode(""); setMember(s.member); }).catch(() => setError("No se pudo entrar. Revisa el código y la persona e inténtalo de nuevo.")).finally(() => setBusy(false));
    }}><h1>{access?.projectName ?? "Entrar al equipo"}</h1><Field label="Código del equipo" type="password" value={code} autoComplete="current-password" required onChange={(e) => setCode(e.target.value)} />
      <label htmlFor="person">Persona</label><select id="person" value={person} onChange={(e) => setPerson(e.target.value)}>{access?.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      <Button type="submit" variant="primary" disabled={busy || !access}>{busy ? "Entrando…" : "Entrar"}</Button>
      {!access && <Button onClick={() => location.reload()}>Reintentar conexión</Button>}
    </form> : <div className="workspace"><section><h1>{project?.name ?? access?.projectName}</h1>
      <nav aria-label="Tickets">{[["team", "Todo el equipo"], ["mine", "Mis tickets"], ["review", "Por revisar"]].map(([id, label]) => <Button key={id} aria-pressed={view === id} onClick={() => setView(id!)}>{label}</Button>)}</nav>
      <label htmlFor="area">Área</label><select id="area" value={area} onChange={(e) => setArea(e.target.value)}><option value="">Todas las áreas</option>{project?.areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select>
      <form className="capture" onSubmit={(e) => {
        e.preventDefault(); if (busy) return; if (!title.trim() && !attempt) { setCaptureError("Escribe un título para continuar."); return; }
        const input = attempt ?? { title: title.trim(), type: "task" as const, ...(area ? { areaId: area } : {}), idempotencyKey: crypto.randomUUID() };
        setAttempt(input); setBusy(true); setCaptureError("");
        void client.createTicket(input).then((receipt) => { setAttempt(undefined); setTitle(""); setRefresh((n) => n + 1); void open(receipt.key); })
          .catch((e: unknown) => { if (e instanceof TaskiClientError && e.status >= 400 && e.status < 500) setAttempt(undefined); setCaptureError(fail(e)); }).finally(() => setBusy(false));
      }}><Field label="Nueva tarea" placeholder="Escribe una frase y pulsa Enter" value={title} disabled={busy || !!attempt} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" disabled={busy}>{busy ? "Guardando…" : attempt ? "Confirmar reintento" : "Añadir"}</Button></form>
      {captureError && <StatusMessage tone="error" title={captureError}>El texto se conserva. Si falta confirmación, se reutiliza la solicitud al reintentar.</StatusMessage>}
      <Field label="Buscar entre los tickets cargados" type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul className="tickets">{rows.filter((r) => `${r.key} ${r.title}`.toLocaleLowerCase("es").includes(search.toLocaleLowerCase("es"))).map((r) => <li key={r.key}><Button onClick={() => void open(r.key)}>{r.title}</Button><small>{r.key} · {project?.statusLabels[r.status]} · {project?.members.find((m) => m.id === r.assigneeId)?.name ?? "Sin asignar"}</small></li>)}</ul>
      {loading && <StatusMessage tone="loading" title="Cargando tickets…" />}
      {!loading && !rows.length && !error && <StatusMessage title="No hay tickets en esta vista" />}
      {cursor && <Button disabled={loading} onClick={() => void more()}>Cargar más</Button>}
      <Button onClick={() => setRefresh((n) => n + 1)}>Actualizar lista</Button>
      <p className="hint">20 tickets por página. La búsqueda usa las páginas cargadas. Actualiza para ver cambios de otras personas.</p>
    </section><DetailPanel open={!!selected} title={detail?.ticket.title ?? selected ?? "Detalle"} onClose={close}>
      {!detail && !detailError && <StatusMessage tone="loading" title="Cargando detalle…" />}{detailError && <StatusMessage tone="error" title={detailError}><Button onClick={() => selected && void open(selected)}>Reintentar detalle</Button></StatusMessage>}
      {detail && <><p>{detail.ticket.key} · {project?.statusLabels[detail.ticket.status]}</p><p className="description">{detail.ticket.description || "Sin descripción"}</p>{detail.comments.map((c) => <p key={c.id}>{c.actor.name}: {c.body}</p>)}{detail.nextCommentsCursor && <p>Se muestran los cinco comentarios más recientes.</p>}</>}
    </DetailPanel></div>}{error && <StatusMessage tone="error" title={error}><Button onClick={() => setRefresh((n) => n + 1)}>Reintentar</Button></StatusMessage>}
    <footer><a href={licenses}>Licencias</a></footer>
  </main>;
}
createRoot(document.getElementById("root")!).render(<App />);
