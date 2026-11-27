# API HTTP v1

Rutas implementadas sobre el mismo `TicketService` y repositorio D1 auditado, sin endpoints de SQL. Todos los tickets/actividad/proyecto exigen cookie de sesión o código Bearer y X-Taski-Member; ver [acceso](access.md). El [MCP](mcp.md) ya comparte este núcleo; la UI conectada se añade en B7.

El [OpenAPI 3.1](api/openapi.json) se genera desde los ocho contratos compartidos por HTTP y MCP. `npm run api:generate` lo actualiza y `api:check` detecta cambios sin versionar. Los campos/tipos de entrada, proyecciones y recibos están definidos en código; el núcleo valida de nuevo sus reglas y referencias.

| Método/ruta | Operación |
| --- | --- |
| GET /api/v1/project | Configuración, miembros/áreas/rótulos, configVersion y cursor actual. knownVersion coincidente omite project. |
| GET /api/v1/tickets | 20 resúmenes por defecto, máximo 50. Filtros status, assigneeId, areaId y type, orden opcional y cursor opaco. |
| POST /api/v1/tickets | Crear/asignar en una operación. Título + idempotencyKey obligatorios. |
| GET /api/v1/tickets/{key} | summary/work/full; work incluye descripción íntegra y cinco comentarios recientes. |
| PATCH /api/v1/tickets/{key} | expectedVersion + idempotencyKey y changes/descriptionPatch/comment, atómicos. |
| DELETE /api/v1/tickets/{key} | Quitar una tarea o feedback con sesión web, `expectedVersion` e `idempotencyKey`. |
| POST /api/v1/tickets/{key}/comments | Añadir body con versión y clave de reintento. |
| PUT /api/v1/tickets/{key}/pull-request | URL manual con versión y clave; no consulta GitHub. |
| GET /api/v1/activity | Cambios desde cursor; filtro ticketKey opcional. |

## Respuestas adecuadas por defecto

Las listas normales solo contienen key/title/status/assigneeId/highlighted/version. `view=work` añade areaId/type/prUrl/createdBy para una UI que necesite esos metadatos, sin descripción o discusión. `order=recent` ordena por fecha de creación descendente y, en caso de empate, por número descendente. Combinado con `view=work` también devuelve `createdAt`. El orden predeterminado es por número ascendente. La consulta SQL tampoco lee las descripciones completas al listar. `omitted` indica el contenido que requiere otra lectura.

El detalle `work` devuelve campos de trabajo, descripción completa y comentarios recientes. `full` añade ID y fechas; no significa conversación sin límite. `commentsLimit` admite 0–50 y nextCommentsCursor recupera páginas anteriores. No se corta texto silenciosamente. Descripciones largas tienen un coste real que no desaparece cambiando de herramienta.

`omitted` enumera también los campos de ticket excluidos por cada vista: `work` señala id, createdAt y updatedAt. `summary` añade url, description, areaId, type, prUrl y createdBy. Un `commentsLimit` positivo permite recuperar comentarios incluso con `summary`, útil para páginas antiguas sin repetir una descripción conocida. El historial se consulta mediante actividad con ticketKey. Ver [semántica y costes verificados](mcp-intent.md), compartidos con MCP.

Las mutaciones devuelven key/URL/versión/campos afectados y commentId opcional, sin retransmitir el ticket entero. Si falta confirmación, no se devuelve un recibo inventado. Los errores tienen `{error:{code,message}}`; SQL, código de acceso y trazas internas no se envían.

## Cursores y contexto conocido

Guarda configVersion y consulta el proyecto con knownVersion para no repetir miembros/rótulos. Su activityCursor es el punto inicial de seguimiento, no el principio de todo el historial.

Una lista puede continuarse enviando solo cursor y limit. El cursor conserva filtros, vista y orden. assigneeId=~ significa sin asignar. `open=true` excluye los tickets terminados; por ejemplo, `type=feedback&open=true` lista el feedback pendiente. No admite `open=false` ni se combina con `status=done`. Cambiar filtros u orden con un cursor o editar la lista entre páginas provoca INVALID_CURSOR. Reinicia la consulta en ese caso. Se usa una fila extra interna para saber si existe continuación.

La actividad entrega eventos concretos, nextCursor y hasMore; consumir todas las páginas antes de avanzar el punto conocido. Puede acotarse a ticketKey. Los comentarios anteriores tienen un cursor ligado a ticket/versión; si se edita el ticket, se pide una lectura reciente de nuevo. Cursores malformados o futuros se rechazan. Un epoch incompatible produce CURSOR_EXPIRED con indicación de resincronizar configuración, listas y contenido necesario antes de continuar actividad. No hay TTL de actividad en esta versión; conservarlo todo evita descartar cambios silenciosamente.

Las lecturas usan D1 primario en esta configuración, sin read replication. La comprobación antes/después de una página detecta revisiones concurrentes; la lectura de comentarios se acota a la versión del ticket leído. La puesta en marcha con réplicas requeriría probar consistencia/bookmarks.

## Escrituras y límites

Ver [reglas](ticket-rules.md), [auditoría](audit.md) y [reintentos](retries.md). Los cuerpos exigen JSON y se limitan a 1 MiB, además de límites de cada campo. No se permite inyectar key/actor/identidad por el cuerpo de una ruta de ticket. Los IDs de miembros y áreas son referencias, no nombres visibles.

Ejemplo de actualización (en un cliente que ya configuró su acceso):

```json
{"expectedVersion":1,"idempotencyKey":"avance-001","changes":{"status":"in_review"},"comment":"Listo para revisar"}
```

Un conflicto 409 exige releer/reconciliar; un reintento de transporte usa la misma clave y los mismos parámetros. No hacer reintentos ciegos con otra versión o clave. Las rutas no tienen CORS abierto; una UI futura usará el mismo origen o un proxy de desarrollo acotado.

Para eliminar `DEMO-003`, envía `DELETE /api/v1/tickets/DEMO-003` desde una sesión web con el cuerpo `{"expectedVersion":2,"idempotencyKey":"borrar-demo-003-v2"}`. El recibo devuelve `changed: ["deleted"]`. El ticket desaparece de las listas y su detalle y adjuntos pasan a responder 404. La actividad general del proyecto conserva el historial y registra el borrado. Repite la misma petición si se pierde el recibo durante el envío.


## Imágenes adjuntas

Los [endpoints de adjuntos](attachments.md#api) permiten listar, subir y retirar imágenes, y descargar el original con el acceso de equipo habitual. Las subidas usan un cuerpo binario y un identificador idempotente por selección.

## Referencia manual a un PR

Envía `changes.prUrl` en `PATCH /api/v1/tickets/{key}` para vincular o sustituir. Usa `null` para retirar. Puedes enviar `changes.status` en la misma operación. La ruta PUT de PR también vincula o sustituye. Ambas rutas usan la misma regla y registran el antes y después.

Ejemplo de `changes` con datos ficticios:

```json
{"prUrl":"https://github.com/example/demo/pull/42","status":"in_review"}
```

La regla admite HTTPS sin credenciales, parámetros ni fragmentos. Recorta espacios exteriores, normaliza esquema y host a minúsculas y omite el puerto 443. Conserva la ruta y los puertos HTTPS explícitos distintos de 443. La validación es local y se aplica también a `update_ticket` y `link_pull_request` por MCP. Los enlaces ya guardados se leen tal como están hasta que se edita el campo.
