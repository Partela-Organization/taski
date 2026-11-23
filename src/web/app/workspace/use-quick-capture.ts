import { useState } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { CreateTicket, TaskiClient } from "../../../client/index.ts";
import { operationError } from "../access/use-team-session.ts";
import { mutationKey } from "../shared/mutation-key.ts";

export function useQuickCapture(client: TaskiClient, feedback: boolean, area: string, onCreated: (key: string) => void, onExpired: () => void) {
  const [taskTitle, setTaskTitle] = useState("");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [context, setContext] = useState("");
  const [attempt, setAttempt] = useState<CreateTicket>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = feedback ? feedbackTitle : taskTitle;
  const setTitle = feedback ? setFeedbackTitle : setTaskTitle;

  async function submit() {
    if (busy) return;
    if (!attempt && !title.trim()) {
      setError("Escribe un título para continuar.");
      return;
    }
    const input = attempt ?? {
      title: title.trim(), type: feedback ? "feedback" as const : "task" as const, idempotencyKey: mutationKey(),
      ...(feedback ? { description: context.trim() } : {}),
      ...(area ? { areaId: area } : {}),
    };
    setAttempt(input);
    setBusy(true);
    setError("");
    try {
      const receipt = await client.createTicket(input);
      setAttempt(undefined);
      if (input.type === "feedback") { setFeedbackTitle(""); setContext(""); }
      else setTaskTitle("");
      onCreated(receipt.key);
      return true;
    } catch (error) {
      if (error instanceof TaskiClientError && error.status >= 400 && error.status < 500) setAttempt(undefined);
      setError(operationError(error, onExpired));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTaskTitle("");
    setFeedbackTitle("");
    setContext("");
    setAttempt(undefined);
    setError("");
  }
  return { title, setTitle, context, setContext, attempt, busy, error, submit, reset, clearError: () => setError("") };
}
