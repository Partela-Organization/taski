# Vistas, operaciones compuestas y contexto incremental

B6-02 comprueba estos recorridos sobre el [MCP autenticado](mcp.md), el núcleo compartido y D1 emulado. El [runner](../scripts/mcp-intent-scenarios.mjs) registra llamadas y rondas de SDK ejecutadas, valida el contenido final y mide los resultados recibidos. La integración con hosts IA y el benchmark frente a Linear continúan en B6-03/B6-04.

## Elegir el contexto que hace falta

| Lectura | Comportamiento |
| --- | --- |
| `list_tickets` | 20 resúmenes por defecto, máximo 50: key, title, status, assigneeId, highlighted y version. `view: "work"` añade areaId, type, prUrl y createdBy. |
| `get_ticket`, `summary` | Los seis campos de resumen y ningún comentario por defecto. `omitted` enumera descripción, metadatos y conversación excluidos. |
| `get_ticket`, `work` | Campos de trabajo, URL y descripción íntegra con cinco comentarios recientes por defecto. `omitted` señala también id, createdBy, createdAt y updatedAt, disponibles en `full`. |
| `get_ticket`, `full` | Todos los campos públicos del ticket, incluida identidad y fechas. La conversación mantiene su límite y paginación. |
| `list_activity` con `ticketKey` | Historial auditable del ticket, paginado por cursor; `get_ticket` no incluye ese historial. |

`commentsLimit` permite 0–50. Un límite de cero omite comentarios y lo indica; no afirma que la conversación esté vacía. `nextCommentsCursor` y `olderComments` señalan páginas anteriores pendientes. Para leerlas sin repetir una descripción conocida, usa `view: "summary"` con el cursor y un `commentsLimit` positivo. Cada página entrega sus comentarios en orden cronológico; las páginas se recorren desde la más reciente a la más antigua. Combínalas por ID/versión, sin invertir ese significado.

`summary` es una vista explícita, no un resumen generado del contenido. La descripción y los comentarios se conservan completos en las vistas que los incluyen. Si el ticket cambia, un cursor de comentarios anterior se rechaza con `INVALID_CURSOR`: relee su versión y conversación reciente.

## Una escritura para el avance completo

`update_ticket` acepta campos, patch de descripción y comentario en una misma operación. Por ejemplo, sobre un ticket ficticio con versión 1:

```json
{
  "key": "DEMO-001",
  "expectedVersion": 1,
  "idempotencyKey": "review-001",
  "changes": {
    "status": "in_review",
    "prUrl": "https://github.com/example/demo/pull/9"
  },
  "descriptionPatch": {"find": "Criterio inicial", "replace": "Criterio revisado"},
  "comment": "Listo para revisar"
}
```

Un éxito incrementa la versión una sola vez y guarda ticket, comentario, evento y recibo en la misma transacción. El recibo devuelve key, URL, versión, nombres de campos afectados y commentId cuando corresponde; no retransmite el ticket ni el texto del comentario. El patch exige una coincidencia única; no puede combinarse con reemplazo completo de descripción.

Una versión obsoleta, un patch ambiguo o un fallo de auditoría impiden el guardado parcial. Reintentar exactamente la misma petición con su clave devuelve el recibo original, aunque la versión esperada ya sea antigua. Reutilizar la clave con otros parámetros produce `IDEMPOTENCY_CONFLICT`. Consulta [reintentos](retries.md) antes de resolver un transporte incierto.

## Conservar contexto y recuperarlo

El catálogo de miembros, áreas, rótulos y política forma parte de la configuración identificada por `configVersion`. La instalación debe incrementarla al modificar esos datos; `get_project({knownVersion})` devuelve la configuración completa si difiere y la omite con `notModified: true` si coincide. Esa versión no es una versión del ticket ni una posición del historial.

Conserva por separado el último cursor de actividad que hayas procesado. `get_project` devuelve el cursor **actual** incluso cuando la configuración no cambia: sustituir por él un cursor pendiente de consumir podría saltarse eventos. El runner consulta la configuración conocida y la actividad en paralelo, usando para esta última el cursor guardado previamente.

Para sincronizar:

1. Obtén configuración y guarda su cursor inicial. Pagina los resúmenes y recupera con `work` o `full` el contenido que necesites.
2. Consume `list_activity` desde el cursor inicial y todas sus páginas mientras `hasMore` sea verdadero. Los eventos contienen versión, actor y cambios concretos; una actualización por patch transmite el patch y no ambas descripciones completas.
3. Aplica cambios por ticket/versión y deduplica comentarios/eventos antes de avanzar el cursor confirmado. Las lecturas y los eventos pueden solaparse.
4. Una lista modificada entre páginas exige reiniciarla; los filtros quedan guardados en su cursor. Un cursor malformado o futuro produce `INVALID_CURSOR`. Un epoch incompatible produce `CURSOR_EXPIRED`.
5. Tras expiración, repite configuración, páginas de lista y contenido necesario con un cursor inicial nuevo, y consume después los eventos desde ese punto. Si vuelve a invalidarse durante la recuperación, repite el recorrido.

Esta versión no descarta actividad por TTL. Crear un ticket o reemplazar una descripción completa puede producir un evento grande: la lectura incremental evita reenviar el ticket entero por defecto, pero no elimina el coste de texto largo que sí cambió. El contenido completo sigue disponible por key.

## Coste observado y presupuestos

Reproducción desde el entorno Node/Python descrito en [MCP](mcp.md):

```sh
npm run mcp:measure -- --intent --check
```

La opción `--intent` añade los recorridos de B6-02 a la medición de B6-01. Sin `--check` imprime los dos informes; `--write` los actualiza para revisión. El [informe de B6-01](benchmarks/b6-mcp-results.json) conserva catálogo, lista de 20 resúmenes y recibo de creación. El [informe de B6-02](benchmarks/b6-intent-results.json) añade vistas, recibos compuestos, actividad y entradas largas.

Muestras proxy del informe B6-02; summary/work/full leen el mismo estado del ticket, con dos comentarios disponibles:

| Artefacto | Tokens proxy de la muestra | Bytes UTF-8 |
| --- | --- | --- |
| Configuración completa | 268 | 833 |
| Configuración conocida | 88 | 191 |
| Ticket summary, sin comentarios | 82 | 325 |
| Ticket work y dos comentarios | 296 | 954 |
| Ticket full y dos comentarios | 352 | 1047 |
| Recibo de estado + avance | 74 | 193 |
| Recibo de PR + estado | 47 | 135 |
| Recibo de patch + avance | 72 | 198 |

La lista normal de 20 resúmenes ocupa 808 tokens proxy, dentro de 1600. Los tres recibos compuestos se comprueban en cada ejecución contra el límite de 200. Son resultados SDK, con `content` y `structuredContent`, serializados como JSON canónico con claves ordenadas y `tiktoken==0.14.0/o200k_base`; no incluyen cabeceras ni IDs JSON-RPC.

Los UUID y timestamps reales hacen variar algunos conteos de tokens. `--check` compara exactamente los bytes, la estructura del informe, las rondas y los conteos deterministas; permite variación solo en los conteos nombrados en `variableTokenMetrics` y exige que los presupuestos de la ejecución actual pasen. No sustituye IDs o fechas en el payload para lograr un resultado fijo. Cada artefacto representa una muestra, sin estadística de latencia o consumo del modelo.

La entrada larga se informa aparte: una descripción de 46.006 caracteres se recupera íntegra y llega a 46.008 tras el patch. Su creación cuesta 10.020 tokens proxy de argumentos y su lectura de trabajo 10.107 de resultado; el patch de cinco caracteres por siete usa 36 tokens de argumentos. Las aserciones comprueban el texto exacto final. Estas lecturas grandes no se presentan como recibos ordinarios ni se recortan para entrar en su presupuesto.

## Llamadas y rondas

Una ronda agrupa llamadas independientes despachadas con `Promise.all`; las páginas dependientes requieren rondas posteriores. El runner excluye preparación, handshake y descubrimiento. Registra operaciones SDK de estos fixtures, sin agente/modelo en el recorrido:

| Flujo Taski | Llamadas observadas | Rondas observadas |
| --- | --- | --- |
| Ticket + comentarios recientes | 1 | 1 |
| Estado + avance | 1 | 1 |
| PR + revisión | 1 | 1 |
| Patch + avance | 1 | 1 |
| Configuración conocida + tres eventos con páginas de dos | 3 | 2 |
| Detalle full + recuperar cuatro comentarios en páginas de dos | 2 | 2 |

Como comparación de operaciones, el contrato del conector Linear consultado permite planificar `get_issue` con campos acotados y `list_comments` como dos lecturas paralelas: dos llamadas, una ronda. Para estado + avance o patch + avance, `save_issue` y `save_comment` también pueden despacharse en una ronda cuando sean independientes; no se convierten por ello en una transacción compartida. PR + estado puede usar `save_issue` con `links` y `state` en una sola llamada. No se atribuye una ronda adicional a Linear cuando puede paralelizar.

Esta es una comparación de contratos, no una ejecución medida de Linear. La recuperación incremental debe compararse con la mejor consulta disponible en ese conector, sin imponerle releer todo. Menos llamadas no demuestra menor tiempo. Uso real, corrección comparada, carga de herramientas y p50/p95 con repeticiones equivalentes se reservan al [protocolo de B6-04](benchmarks/protocol.md).
