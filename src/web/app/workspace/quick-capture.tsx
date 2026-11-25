import { Button, Field, StatusMessage } from "../../components.tsx";
import { FeedbackMedia } from "./feedback-media.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";
import type { useQuickCapture } from "./use-quick-capture.ts";

export function QuickCapture({ model, feedback, onCancel }: {
  model: ReturnType<typeof useQuickCapture>; feedback: boolean; onCancel?: (() => void) | undefined;
}) {
  const { title, setTitle, context, setContext, attempt, busy, error, submit } = model;
  const busyLabel = busy ? "Guardando…" : attempt ? "Confirmar reintento" : undefined;
  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit();
  };
  const details = <>
    <label htmlFor="feedback-context">Detalles (opcional)</label>
    <textarea id="feedback-context" rows={3} maxLength={100000} value={context} disabled={busy || !!attempt}
      onChange={(event) => setContext(event.target.value)} />
  </>;
  return <>
    {feedback ? <form className="feedback-capture" onSubmit={onSubmit}>
      <Field id="capture-title" label="¿Qué quieres compartir?" placeholder={onCancel ? "Escribe tu idea…" : "Escribe una idea o algo que mejorar…"}
        maxLength={240} value={title} disabled={busy || !!attempt} onChange={(event) => setTitle(event.target.value)} />
      {onCancel ? <details className="feedback-context" open={context ? true : undefined}>
        <summary>Añadir detalles</summary>{details}
      </details> : details}
      <FeedbackMedia items={model.attachments} onChange={model.setAttachments} disabled={busy || !!attempt} canRemove={!busy && (!attempt || !!model.createdKey)} recording={model.recording} onRecording={model.setRecording} />
      <div className="feedback-capture__actions">
        <Button variant="primary" type="submit" disabled={busy || model.recording || (!attempt && !title.trim())}>{busyLabel ?? "Enviar feedback"}</Button>
        {onCancel && <Button variant="secondary" disabled={busy || model.recording || !!attempt} onClick={onCancel}>Cerrar editor</Button>}
      </div>
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
