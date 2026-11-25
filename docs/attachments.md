# Imágenes y notas de voz

Taski admite JPEG, PNG, WebP y notas de voz WebM, MP4 y Ogg de hasta 5 MiB, con diez adjuntos por ticket. Las imágenes se pueden añadir al detalle de un ticket guardado. Desde el formulario de Feedback también puedes seleccionar una imagen o grabar, escuchar y descartar una nota de voz antes de enviar. El navegador debe tener permiso para usar el micrófono. D1 guarda la referencia, el nombre, el tipo, el tamaño y los actores y fechas de alta y retirada. R2 guarda el archivo original. Convertir feedback en tarea conserva sus imágenes.

## Usar desde la web

1. Guarda un feedback y abre el detalle. Pulsa **Adjuntar imagen** y elige el archivo.
2. Pulsa **Subir imagen**. Cuando se confirma, aparece una vista previa. Pulsa la imagen para abrir el original en otra pestaña.
3. Si la confirmación falla, pulsa **Reintentar subida**. Taski reutiliza el identificador de esa selección. Quien subió la imagen puede retirarla con **Quitar**.

Ejemplo: guarda un aporte titulado “El mensaje de confirmación tapa el formulario” y adjunta `captura.png`. La vista previa solicita el original al mostrarse. La primera versión no genera archivos de miniatura separados.

Al eliminar el ticket, Taski cierra el acceso a sus adjuntos y conserva los archivos en el bucket privado con sus referencias de auditoría.

El navegador necesita acceso al selector de archivos. Para una foto HEIC, exporta primero una copia JPEG o PNG. La API verifica tamaño, firma de formato y tipo declarado. La grabación elige un formato compatible con el navegador y el audio se reproduce en el detalle del ticket.

## Activar por instalación

`npm run db:migrate` aplica la migración de metadatos. En desarrollo, Wrangler crea el bucket local de ejemplo y la web usa el mismo flujo que la instalación alojada.

En Cloudflare, crea un bucket privado por entorno, añade su binding al archivo de configuración de ese Worker y aplica las migraciones antes de desplegar. Ejemplo de la sección para una instalación de prueba:

```json
{
  "r2_buckets": [{ "binding": "ATTACHMENTS", "bucket_name": "taski-test-attachments" }]
}
```

El Worker transmite el archivo solo después de autenticar al miembro. No habilites un dominio público del bucket: el cliente usa la sesión de Taski o las cabeceras de la API. Si falta el binding, el detalle oculta la sección de imágenes. Consulta la [guía del Worker](deployment/cloudflare.md) y la [referencia de R2](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## API

Todas las rutas requieren sesión de equipo o autenticación HTTP por cabeceras y operan sobre un ticket de la instalación.

| Método y ruta | Resultado |
| --- | --- |
| `GET /api/v1/tickets/{key}/attachments` | `{enabled, items}` con metadatos y `canRemove`. Solo incluye adjuntos confirmados y activos. |
| `PUT /api/v1/tickets/{key}/attachments/{id}` | Envía bytes con el tipo MIME y el nombre codificado de la imagen en `X-Taski-Filename`. Devuelve los metadatos confirmados. |
| `GET /api/v1/tickets/{key}/attachments/{id}` | Original privado en el tipo MIME confirmado. |
| `DELETE /api/v1/tickets/{key}/attachments/{id}` | Retira la imagen, registra la acción y borra el archivo. Solo el autor del adjunto puede hacerlo. Devuelve 204 y se puede reintentar. |

Genera `id` como 32 caracteres hexadecimales minúsculos aleatorios. Para reintentar un PUT conserva el ID, el autor, el nombre, el contenido y el tipo. Reutilizar el ID con otros datos devuelve conflicto. Un adjunto retirado no se puede volver a publicar con su ID. El tamaño excesivo devuelve 413 y el formato incompatible devuelve 415.

Por ejemplo, con el código local en `TASKI_CLIENT_CODE`, una captura JPEG ficticia y el miembro Alex:

```sh
curl --fail-with-body --request PUT \
  'http://127.0.0.1:8787/api/v1/tickets/DEMO-001/attachments/00112233445566778899aabbccddeeff' \
  -H "Authorization: Bearer $TASKI_CLIENT_CODE" \
  -H 'X-Taski-Member: alex' -H 'Content-Type: image/jpeg' \
  -H 'X-Taski-Filename: captura.jpg' --data-binary '@captura.jpg'
```

El [cliente TypeScript](client.md) ofrece `listAttachments`, `uploadAttachment`, `attachmentUrl` y `removeAttachment`. El contrato completo está en [OpenAPI](api/openapi.json).

## Reintentos, auditoría y recuperación

D1 reserva el identificador y la huella de contenido antes de escribir en R2. Una reserva sin confirmar caduca al cabo de una hora y deja de contar contra el límite del ticket. El cliente debe elegir la imagen de nuevo si caducó el intento. El listado y la descarga solo muestran escrituras confirmadas. Retirar un adjunto oculta sus bytes desde que D1 registra la retirada; si falla el borrado en R2 se puede reintentar el mismo DELETE. El alta y la retirada tienen su propio registro de auditoría en `ticket_attachments` y no incrementan la versión del texto del ticket.

Para recuperar espacio tras interrupciones, el operador puede listar las claves de reservas caducadas o adjuntos retirados y eliminar los objetos que aún existan en el bucket asociado. Este ejemplo concede margen a peticiones iniciadas antes de la caducidad. Conserva las filas en D1 para auditoría y reintentos.

```sql
SELECT 'ticket-images/' || ticket_id || '/' || id AS object_key
FROM ticket_attachments
WHERE (uploaded_at IS NULL AND reserved_at < unixepoch('now', '-2 hours') * 1000)
   OR (removed_at IS NOT NULL AND unixepoch(removed_at) < unixepoch('now', '-1 hour'));
```

Para un respaldo de adjuntos, conserva tanto D1 como el bucket de ese entorno. Solo la copia de D1 mantiene la auditoría y las referencias, y requerirá restaurar los objetos de R2 para abrir las imágenes.
