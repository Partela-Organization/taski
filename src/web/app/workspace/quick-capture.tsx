import { useState } from "react";
import { Button, Field, StatusMessage } from "../../components.tsx";
import { WorkspaceIcon } from "../shared/marks.tsx";
import type { useQuickCapture } from "./use-quick-capture.ts";

export function QuickCapture({ model, feedback }: { model: ReturnType<typeof useQuickCapture>; feedback: boolean }) {
  const { title, setTitle, context, setContext, attempt, busy, error, submit } = model;
  const [expanded, setExpanded] = useState(false);
  const showContext = feedback && (expanded || !!context);
  const label = attempt ? "Confirmar reintento" : feedback ? "Compartir feedback" : "Añadir";
  return <>
    <form className={feedback ? "feedback-capture" : "capture"} onSubmit={(event) => {
      event.preventDefault();
      void submit().then((saved) => { if (saved) setExpanded(false); });
    }}>
      <div className="capture-line">
        <WorkspaceIcon name="plus" />
        <Field id="capture-title" label={feedback ? "Título del feedback" : "Nueva tarea"}
          placeholder={feedback ? "Escribe una idea o algo que mejorar…" : "Añade una tarea y pulsa Enter…"}
          maxLength={240} value={title} disabled={busy || !!attempt} onChange={(event) => setTitle(event.target.value)} />
        <Button type="submit" disabled={busy} aria-label={label} title={label}>
          {busy ? "Guardando…" : attempt ? label : <span aria-hidden="true">↵</span>}
        </Button>
      </div>
      {feedback && !showContext && <Button className="context-toggle" onClick={() => setExpanded(true)} disabled={busy || !!attempt}>Añadir contexto</Button>}
      {showContext && <div className="feedback-context">
        <label htmlFor="feedback-context">Contexto (opcional)</label>
        <textarea id="feedback-context" rows={2} maxLength={100000} value={context} disabled={busy || !!attempt}
          onChange={(event) => setContext(event.target.value)} />
      </div>}
    </form>
    {error && <StatusMessage tone="error" title={error} />}
  </>;
}
