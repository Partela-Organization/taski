import { useCallback, useEffect, useState } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { TaskiClient } from "../../../client/index.ts";

export type Member = { id: string; name: string };
export type Access = Awaited<ReturnType<TaskiClient["accessOptions"]>>;

export function useTeamSession(client: TaskiClient) {
  const [access, setAccess] = useState<Access>();
  const [member, setMember] = useState<Member>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const [options, session] = await Promise.all([
          client.accessOptions(),
          client.session().catch((error: unknown) => {
            if (error instanceof TaskiClientError && error.status === 401) return undefined;
            throw error;
          }),
        ]);
        if (!active) return;
        setAccess(options);
        setMember(session?.member);
      } catch {
        if (active) setError("No se pudo conectar con el proyecto.");
      } finally {
        if (active) setReady(true);
      }
    }
    void restore();
    return () => { active = false; };
  }, [client]);

  const expire = useCallback(() => {
    setMember(undefined);
    setError("La sesión terminó. Vuelve a entrar.");
  }, []);

  async function signIn(code: string, memberId: string) {
    const result = await client.login(code, memberId);
    setError("");
    setMember(result.member);
  }
  async function signOut() {
    await client.logout();
    setMember(undefined);
  }
  return { access, member, ready, error, expire, signIn, signOut };
}

export function operationError(error: unknown, onExpired: () => void): string {
  if (error instanceof TaskiClientError && error.status === 401) {
    onExpired();
    return "La sesión terminó. Vuelve a entrar.";
  }
  return "No se pudo confirmar la operación. Puedes volver a intentarlo.";
}
