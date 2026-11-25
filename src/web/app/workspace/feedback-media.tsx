import { useEffect, useRef, useState } from "react";
import { attachmentContentTypes, maxAttachmentBytes, maxTicketAttachments } from "../../../client/index.ts";
import type { PendingAttachment } from "./use-quick-capture.ts";
import { Button } from "../../components.tsx";
import { mutationKey } from "../shared/mutation-key.ts";

export function FeedbackMedia({ items, onChange, disabled, canRemove, recording, onRecording }: {
  items: PendingAttachment[]; onChange: (items: PendingAttachment[]) => void; disabled: boolean; canRemove: boolean; recording: boolean; onRecording: (value: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | undefined>(undefined);
  const stream = useRef<MediaStream | undefined>(undefined);
  const picker = useRef<HTMLInputElement>(null);
  const latest = useRef(items);
  latest.current = items;
  useEffect(() => () => {
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    onRecording(false);
  }, []);

  function add(file: File) {
    const type = attachmentContentTypes.find((entry) => entry === file.type);
    if (!type || !file.size || file.size > maxAttachmentBytes || latest.current.length >= maxTicketAttachments) {
      setError("El archivo debe ser compatible, pesar hasta 5 MiB y respetar el límite de 10 adjuntos.");
      return;
    }
    setError("");
    onChange([...latest.current, { id: mutationKey(), file, contentType: type }]);
  }

  async function start() {
    onRecording(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") throw new Error("unsupported");
      const mimeType = ["audio/mp4", "audio/webm", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw new Error("unsupported");
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = input;
      const active = new MediaRecorder(input, { mimeType });
      recorder.current = active;
      const chunks: Blob[] = [];
      active.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      active.onerror = () => {
        active.onstop = null;
        input.getTracks().forEach((track) => track.stop());
        setReady(false);
        onRecording(false);
        setError("No se pudo grabar el audio.");
      };
      active.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        setReady(false);
        onRecording(false);
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size) add(new File([blob], `nota-de-voz.${mimeType.split("/")[1]}`, { type: mimeType }));
      };
      active.start();
      setReady(true);
      setError("");

    } catch {
      stream.current?.getTracks().forEach((track) => track.stop());
      onRecording(false);
      setError("No se pudo acceder al micrófono. Comprueba el permiso y vuelve a intentar.");
    }
  }

  return <div className="feedback-media">
    <input ref={picker} type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Elegir imagen para feedback"
      onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) add(file); event.currentTarget.value = ""; }} />
    <div className="feedback-media__actions">
      <Button variant="secondary" disabled={disabled || recording} onClick={() => picker.current?.click()}>Adjuntar imagen</Button>
      {recording ? <Button variant="secondary" disabled={!ready} onClick={() => recorder.current?.stop()}>Detener grabación</Button> :
        <Button variant="secondary" disabled={disabled} onClick={() => void start()}>Grabar audio</Button>}
    </div>
    {items.map((item) => <div className="feedback-media__item" key={item.id}>
      <span>{item.file.name}</span>
      {item.contentType.startsWith("audio/") && <AudioPreview file={item.file} />}
      <Button variant="secondary" disabled={!canRemove} onClick={() => onChange(latest.current.filter(({ id }) => id !== item.id))}>Quitar</Button>
    </div>)}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function AudioPreview({ file }: { file: File }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return url ? <audio controls src={url} /> : null;
}
