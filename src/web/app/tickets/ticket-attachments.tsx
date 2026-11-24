import { useEffect, useRef, useState } from "react";
import { attachmentContentTypes, maxAttachmentBytes, maxTicketAttachments, TaskiClientError } from "../../../client/index.ts";
import type { Attachment, AttachmentContentType, AttachmentList, TaskiClient } from "../../../client/index.ts";
import { Button, StatusMessage } from "../../components.tsx";
import { mutationKey } from "../shared/mutation-key.ts";

interface Selection { file: File; contentType: AttachmentContentType; id: string }

export function TicketAttachments({ client, ticketKey }: { client: TaskiClient; ticketKey: string }) {
  const picker = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<AttachmentList>();
  const [selection, setSelection] = useState<Selection>();
  const [loadingError, setLoadingError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    setLoadingError(false);
    void client.listAttachments(ticketKey).then((result) => {
      if (active) setList(result);
    }).catch(() => { if (active) setLoadingError(true); });
    return () => { active = false; };
  }, [client, ticketKey, revision]);

  function select(file?: File) {
    if (!file) return;
    setNotice("");
    const contentType = attachmentContentTypes.find((type) => file.type === type);
    if (!contentType || !file.size || file.size > maxAttachmentBytes) {
      setError("Elige una imagen JPEG, PNG o WebP de hasta 5 MiB.");
      setSelection(undefined);
      return;
    }
    setError("");
    setSelection({ file, contentType, id: mutationKey() });
  }

  async function upload() {
    if (!selection || busy) return;
    setBusy(true);
    setError("");
    try {
      const { file, contentType, id } = selection;
      const image = await client.uploadAttachment(ticketKey, id, {
        name: file.name, contentType, bytes: new Uint8Array(await file.arrayBuffer()),
      });
      setList((current) => ({ enabled: true, items: [...(current?.items.filter((item) => item.id !== id) ?? []), image] }));
      setSelection(undefined);
      setNotice("Imagen adjuntada.");
    } catch (failure) {
      if (failure instanceof TaskiClientError) {
        switch (failure.code) {
          case "PAYLOAD_TOO_LARGE":
          case "UNSUPPORTED_IMAGE":
          case "INVALID_INPUT":
            setSelection(undefined);
            setError("No se pudo leer la imagen. Selecciona un archivo JPEG, PNG o WebP de hasta 5 MiB.");
            return;
          case "ATTACHMENT_LIMIT":
            setError(`Este ticket admite hasta ${maxTicketAttachments} imágenes.`);
            return;
          case "ATTACHMENT_EXPIRED":
            setSelection(undefined);
            setError("La subida expiró. Selecciona la imagen de nuevo.");
            return;
        }
      }
      setError("No se pudo confirmar la subida. Puedes reintentar con la misma imagen.");
    } finally { setBusy(false); }
  }

  async function remove(image: Attachment) {
    if (busy || !confirm(`¿Quitar «${image.name}» del ticket?`)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.removeAttachment(ticketKey, image.id);
      setList((current) => ({ enabled: true, items: current?.items.filter(({ id }) => id !== image.id) ?? [] }));
      setNotice("Imagen retirada.");
    } catch { setError("No se pudo confirmar la retirada. Puedes reintentar."); }
    finally { setBusy(false); }
  }

  if (loadingError) return <StatusMessage tone="error" title="No se pudieron cargar las imágenes.">
    <Button variant="secondary" onClick={() => setRevision((n) => n + 1)}>Reintentar imágenes</Button>
  </StatusMessage>;
  if (!list?.enabled) return null;

  return <section className="ticket-attachments" aria-label="Imágenes adjuntas" aria-busy={busy || undefined}>
    <div className="ticket-attachments__heading">
      <h3>Imágenes</h3>
      <input ref={picker} type="file" aria-label="Elegir imagen" accept={attachmentContentTypes.join(",")}
        hidden onChange={(event) => {
          select(event.currentTarget.files?.[0]);
          event.currentTarget.value = "";
        }} />
      {list.items.length < maxTicketAttachments &&
        <Button variant="secondary" disabled={busy} onClick={() => picker.current?.click()}>Adjuntar imagen</Button>}
    </div>
    {selection && <div className="ticket-attachments__selection">
      <span>{selection.file.name}</span>
      <Button variant="primary" disabled={busy} onClick={() => void upload()}>
        {busy ? "Subiendo…" : error ? "Reintentar subida" : "Subir imagen"}
      </Button>
      <Button variant="secondary" disabled={busy} onClick={() => { setSelection(undefined); setError(""); }}>Cancelar</Button>
    </div>}
    {list.items.length > 0 && <ul className="ticket-attachments__grid">
      {list.items.map((image) => {
        const url = client.attachmentUrl(ticketKey, image.id);
        return <li key={image.id}>
          <a href={url} target="_blank" rel="noreferrer" aria-label={`Abrir ${image.name}`}>
            <img src={url} alt="" loading="lazy" />
            <span>{image.name}</span>
          </a>
          {image.canRemove && <Button variant="secondary" disabled={busy} aria-label={`Quitar ${image.name}`}
            onClick={() => void remove(image)}>Quitar</Button>}
        </li>;
      })}
    </ul>}
    {error && <StatusMessage tone="error" title={error} />}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
