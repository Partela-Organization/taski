import { useState } from "react";
import { Avatar, Button, Field, StatusMessage } from "../../components.tsx";
import { Wordmark } from "../shared/marks.tsx";
import { ThemeControl } from "../shared/theme-control.tsx";
import type { Theme } from "../../theme.ts";
import type { Access } from "./use-team-session.ts";

export function SignIn({ access, ready, sessionError, theme, onTheme, onSignIn }: {
  access: Access | undefined; ready: boolean; sessionError: string; theme: Theme;
  onTheme: (theme: Theme) => void; onSignIn: (code: string, memberId: string) => Promise<void>;
}) {
  const [person, setPerson] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const memberId = person || access?.members[0]?.id || "";
  return <main className="app-entry">
    <div className="entry-story">
      <Wordmark name={access?.brandName ?? "Taski"} />
      <p className="entry-project">{access?.projectName ?? "Taski"}</p>
      <p className="entry-summary">Tareas y feedback del equipo</p>
    </div>
    <div className="entry-content">
      <div className="entry-controls"><ThemeControl theme={theme} onChange={onTheme} /></div>
      {!ready ? <StatusMessage tone="loading" title="Conectando…" /> : <form className="login" onSubmit={(event) => {
        event.preventDefault();
        if (busy || !memberId) return;
        setBusy(true);
        setError("");
        void onSignIn(code, memberId).catch(() => setError("No se pudo entrar. Revisa el código y la persona e inténtalo de nuevo."))
          .finally(() => setBusy(false));
      }}>
        <h1>Entrar al equipo</h1>
        <Field label="Código del equipo" type="password" value={code} autoComplete="current-password" required onChange={(e) => setCode(e.target.value)} />
        {access && <fieldset className="member-choices" disabled={busy}>
          <legend>Persona</legend>
          {access.members.map((member) => <label className="member-choice" key={member.id}>
            <input type="radio" name="person" value={member.id} checked={memberId === member.id} onChange={() => setPerson(member.id)} />
            <span aria-hidden="true"><Avatar name={member.name} /></span>{member.name}
          </label>)}
        </fieldset>}
        {(error || sessionError) && <StatusMessage tone="error" title={error || sessionError} />}
        <Button type="submit" variant="primary" disabled={busy || !memberId}>{busy ? "Entrando…" : "Entrar"}</Button>
        {!access && <Button onClick={() => location.reload()}>Reintentar conexión</Button>}
      </form>}
    </div>
  </main>;
}
