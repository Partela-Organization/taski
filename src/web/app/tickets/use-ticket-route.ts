import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskiClient, TicketResult } from "../../../client/index.ts";
import { operationError } from "../access/use-team-session.ts";
import type { ConversationDraft } from "./conversation.tsx";
import type { Draft } from "./use-ticket-edit.ts";

export const ticketPath = (key: string) => `/t/${encodeURIComponent(key)}`;

export function useTicketRoute(client: TaskiClient, memberId: string | undefined, onExpired: () => void) {
  const [selected, setSelected] = useState<string>();
  const [detail, setDetail] = useState<TicketResult<"full">>();
  const [error, setError] = useState("");
  const drafts = useRef(new Map<string, Draft>());
  const conversations = useRef(new Map<string, ConversationDraft>());
  const generation = useRef(0);

  const clear = useCallback(() => {
    generation.current++;
    setSelected(undefined);
    setDetail(undefined);
    setError("");
  }, []);

  const close = useCallback(() => {
    clear();
    if (location.pathname !== "/") history.pushState(null, "", "/");
  }, [clear]);

  const open = useCallback(async (key: string, navigate = true) => {
    if (navigate && location.pathname !== ticketPath(key)) history.pushState(null, "", ticketPath(key));
    const id = ++generation.current;
    setSelected(key);
    setDetail(undefined);
    setError("");
    try {
      const result = await client.getTicket(key, { view: "full", commentsLimit: 5 });
      if (id === generation.current) setDetail(result);
    } catch (error) {
      if (id === generation.current) setError(operationError(error, onExpired));
    }
  }, [client, onExpired]);

  useEffect(() => {
    if (!memberId) { clear(); return; }
    function followLocation() {
      const match = /^\/t\/([^/]+)$/.exec(location.pathname);
      if (!match) { clear(); return; }
      let key: string;
      try { key = decodeURIComponent(match[1]!); }
      catch { clear(); return; }
      void open(key, false);
    }
    function warnOnUnload(event: BeforeUnloadEvent) {
      if (!drafts.current.size && !conversations.current.size) return;
      event.preventDefault();
      event.returnValue = "";
    }
    followLocation();
    window.addEventListener("popstate", followLocation);
    window.addEventListener("beforeunload", warnOnUnload);
    return () => {
      generation.current++;
      window.removeEventListener("popstate", followLocation);
      window.removeEventListener("beforeunload", warnOnUnload);
    };
  }, [memberId, open, clear]);

  function reset() {
    drafts.current.clear();
    conversations.current.clear();
    close();
  }
  function syncDetail(fresh: TicketResult<"full">) {
    setDetail((current) => current?.ticket.key === fresh.ticket.key ? fresh : current);
  }
  return { selected, detail, error, syncDetail, drafts: drafts.current, conversations: conversations.current, open, close, reset };
}
