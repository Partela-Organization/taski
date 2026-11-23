import { Button, Field, StatusMessage } from "../../components.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";
import type { useQuickCapture } from "./use-quick-capture.ts";

export function QuickCapture({ model, feedback }: { model: ReturnType<typeof useQuickCapture>; feedback: boolean }) {
  const { title, setTitle, context, setContext, attempt, busy, error, submit } = model;
  const busyLabel = busy ? "Guardando…" : attempt ? "Confirmar reintento" : undefined;
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };
  return <>
    {feedback ? <form className="feedback-capture" onSubmit={onSubmit}>
      <Field id="capture-title" label="¿Qué quieres compartir?" placeholder="Escribe una idea o algo que mejorar…"
        maxLength={240} value={title} disabled={busy || !!attempt} onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor="feedback-context">Detalles (opcional)</label>
      <textarea id="feedback-context" rows={2} maxLength={100000} value={context} disabled={busy || !!attempt}
        onChange={(event) => setContext(event.target.value)} />
      <Button variant="primary" type="submit" disabled={busy || (!attempt && !title.trim())}>{busyLabel ?? "Enviar feedback"}</Button>
    </form> : <form className="capture" onSubmit={onSubmit}>
      <div className="capture-line">
        <WorkspaceIcon name="plus" />
        <Field id="capture-title" label="Nueva tarea" placeholder="Añade una tarea y pulsa Enter…"
          maxLength={240} value={title} disabled={busy || !!attempt} onChange={(event) => setTitle(event.target.value)} />
        <Button variant="secondary" type="submit" disabled={busy}>{busyLabel ?? "Añadir"}</Button>
      </div>
    </form>}
    {error && <StatusMessage tone="error" title={error} />}
  </>;
}
