import { useCallback, useEffect, useRef, useState } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { HorizonBlock, HorizonMeta, HorizonStatus, HorizonSummary, SaveHorizon, TaskiClient } from "../../../client/index.ts";
import { operationError } from "../access/use-team-session.ts";
import { mutationKey } from "../shared/mutation-key.ts";

export function useHorizonList(client: TaskiClient, memberId: string | undefined, onExpired: () => void) {
  const [items, setItems] = useState<HorizonSummary[]>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!memberId) { setItems(undefined); return; }
    let active = true;
    client.listHorizon().then((result) => { if (active) { setItems(result.items); setError(""); } },
      (failure) => { if (active) setError(operationError(failure, onExpired)); });
    return () => { active = false; };
  }, [client, memberId, revision, onExpired]);
  return { items, error, refresh };
}

export interface Draft { title: string; status: HorizonStatus; areaId: string | null; blocks: HorizonBlock[] }
export type SaveState = "saved" | "pending" | "saving" | "retrying" | "conflict" | "error";

const same = (a: Draft, b: Draft) => JSON.stringify(a) === JSON.stringify(b);

/**
 * One document with autosave. Every save carries the version it was based on and an idempotency key;
 * a lost response is retried with the same request, and a conflict stops autosave until the person decides.
 */
export function useHorizonDoc(client: TaskiClient, id: string, onExpired: () => void, onSaved: () => void) {
  const [meta, setMeta] = useState<HorizonMeta>();
  const [draft, setDraft] = useState<Draft>();
  const [state, setState] = useState<SaveState>("saved");
  const [error, setError] = useState("");
  const version = useRef(0);
  const saved = useRef<Draft | undefined>(undefined);
  const current = useRef<Draft | undefined>(undefined);
  const attempt = useRef<{ request: SaveHorizon & { expectedVersion: number }; snapshot: Draft } | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  const retries = useRef(0);

  const load = useCallback(async () => {
    setError("");
    try {
      const { doc } = await client.getHorizon(id);
      const { blocks, ...rest } = doc;
      const fresh: Draft = { title: doc.title, status: doc.status, areaId: doc.areaId, blocks };
      version.current = doc.version; saved.current = fresh; current.current = fresh; attempt.current = undefined;
      setMeta(rest); setDraft(fresh); setState("saved");
    } catch (failure) {
      setError(failure instanceof TaskiClientError && failure.code === "NOT_FOUND" ? "Este documento ya no está disponible." : operationError(failure, onExpired));
    }
  }, [client, id, onExpired]);
  useEffect(() => { void load(); return () => clearTimeout(timer.current); }, [load]);

  const save = useCallback(async () => {
    if (busy.current || !current.current || !saved.current) return;
    if (!attempt.current) {
      if (same(current.current, saved.current)) { setState("saved"); return; }
      const snapshot = current.current;
      attempt.current = { snapshot, request: { expectedVersion: version.current, idempotencyKey: mutationKey(), ...snapshot,
        ...(snapshot.title.trim() ? {} : { title: "Sin título" }) } };
    }
    busy.current = true;
    setState("saving");
    const { request, snapshot } = attempt.current;
    try {
      let receipt;
      try { receipt = await client.updateHorizon(id, request); }
      catch (failure) {
        if (!(failure instanceof TaskiClientError && failure.code === "EMPTY_UPDATE")) throw failure;
      }
      if (receipt) version.current = receipt.version;
      attempt.current = undefined; retries.current = 0; saved.current = snapshot;
      setMeta((old) => old && { ...old, version: version.current, title: snapshot.title, status: snapshot.status, areaId: snapshot.areaId, updatedAt: new Date().toISOString() });
      onSaved();
      if (current.current && !same(current.current, snapshot)) { setState("pending"); timer.current = setTimeout(() => void save(), 400); }
      else setState("saved");
    } catch (failure) {
      if (failure instanceof TaskiClientError && failure.status === 409) {
        attempt.current = undefined; setState("conflict");
        setError("Otra persona o un agente guardó este documento mientras escribías.");
      } else if (failure instanceof TaskiClientError && failure.status >= 400 && failure.status < 500) {
        attempt.current = undefined; setState("error");
        setError(failure.status === 401 ? operationError(failure, onExpired) : "No se pudo guardar: revisa el contenido e inténtalo otra vez.");
      } else {
        // The write may have landed: retry the identical request with growing pauses.
        retries.current += 1; setState("retrying");
        timer.current = setTimeout(() => void save(), Math.min(30_000, 1000 * 2 ** retries.current));
      }
    } finally { busy.current = false; }
  }, [client, id, onExpired, onSaved]);

  function edit(change: Partial<Draft>) {
    if (!current.current) return;
    const next = { ...current.current, ...change };
    current.current = next;
    setDraft(next);
    if (state === "conflict" || state === "retrying" || busy.current) return;
    setState("pending");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 700);
  }

  /** After a conflict: keep this tab's text on top of the newest version, or discard it. */
  async function keepMine() {
    const mine = current.current;
    if (!mine) return;
    try {
      const { doc } = await client.getHorizon(id);
      version.current = doc.version;
      saved.current = { title: doc.title, status: doc.status, areaId: doc.areaId, blocks: doc.blocks };
      setError(""); setState("pending");
      await save();
    } catch (failure) { setError(operationError(failure, onExpired)); }
  }

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (state !== "saved") { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state]);

  return { meta, draft, state, error, edit, retry: () => { clearTimeout(timer.current); void save(); }, reload: load, keepMine };
}
