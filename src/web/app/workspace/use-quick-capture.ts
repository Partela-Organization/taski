import { useState } from "react";
import { TaskiClientError } from "../../../client/index.ts";
import type { AttachmentContentType, CreateTicket, TaskiClient } from "../../../client/index.ts";
import { operationError } from "../access/use-team-session.ts";
import { mutationKey } from "../shared/mutation-key.ts";

export interface PendingAttachment { id: string; file: File; contentType: AttachmentContentType }

export function useQuickCapture(client: TaskiClient, feedback: boolean, area: string, onCreated: (key: string) => void, onExpired: () => void) {
  const [taskTitle, setTaskTitle] = useState("");
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [context, setContext] = useState("");
  const [attempt, setAttempt] = useState<CreateTicket>();
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [createdKey, setCreatedKey] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const title = feedback ? feedbackTitle : taskTitle;
  const setTitle = feedback ? setFeedbackTitle : setTaskTitle;

  async function submit() {
    if (busy || recording) return;
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
    let savedKey = createdKey;
    try {
      const receipt = savedKey ? { key: savedKey } : await client.createTicket(input);
      savedKey = receipt.key;
      setCreatedKey(receipt.key);
      for (const attachment of input.type === "feedback" ? attachments : []) {
        await client.uploadAttachment(receipt.key, attachment.id, {
          name: attachment.file.name, contentType: attachment.contentType,
          bytes: new Uint8Array(await attachment.file.arrayBuffer()),
        });
      }
      setCreatedKey(undefined);
      if (input.type === "feedback") setAttachments([]);
      setAttempt(undefined);
      if (input.type === "feedback") { setFeedbackTitle(""); setContext(""); }
      else setTaskTitle("");
      onCreated(receipt.key);
      return true;
    } catch (error) {
      if (!savedKey && error instanceof TaskiClientError && error.status >= 400 && error.status < 500) setAttempt(undefined);
      setError(savedKey ? "El feedback se guardó. Reintenta para completar los adjuntos." : operationError(error, onExpired));
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setTaskTitle("");
    setFeedbackTitle("");
    setContext("");
    setAttempt(undefined);
    setCreatedKey(undefined);
    setAttachments([]);
    setError("");
  }
  return { title, setTitle, context, setContext, attempt, busy, error, submit, reset,
    attachments, setAttachments, recording, setRecording, createdKey, clearError: () => setError("") };
}
