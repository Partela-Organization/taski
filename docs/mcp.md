# MCP sobre Worker/D1

B6-01 expone `/mcp` mediante Streamable HTTP autenticado. Usa los mismos contratos, `Operations`, `TicketService` y transacciones D1 que la [API HTTP](api.md). No importa el spike Python ni guarda tickets en memoria. Está comprobado localmente con el SDK MCP 2.4.0 y con [recorridos reales de Claude Code y Codex](verification/b6-agents.md); el despliegue corresponde a B11.

B6-02 añade [vistas, operaciones compuestas y recuperación incremental verificadas](mcp-intent.md), con llamadas/rondas observadas y recibos de estado + avance dentro del presupuesto proxy.

## Configuración mínima

1. Instala las dependencias con `npm ci` y aplica las migraciones con `npm run db:migrate`.
2. Crea `.dev.vars` desde `.dev.vars.example` y elige un código local, según [acceso de equipo](access.md).
3. Arranca `npm run dev`. El preset demo utiliza `http://127.0.0.1:8787/mcp`.
4. Configura las cabeceras siguientes en tu cliente Streamable HTTP, conservando el código fuera de Git:

| Cabecera | Valor |
| --- | --- |
| `Authorization` | `Bearer <código de la instalación>` |
| `X-Taski-Member` | ID configurado, por ejemplo `alex` en el preset demo. |
| `X-Taski-Client` | Nombre del cliente, opcional, máximo 80 caracteres. |

El código se exige también para descubrir el catálogo. Las cookies web no autentican MCP. Todas las operaciones construyen un actor `agent/mcp` con identidad declarada; el responsable del ticket puede ser otra persona. La política normal permite dejar el trabajo en `in_review` y rechaza `done` sin delegación de servidor.

El Host debe coincidir con el hostname de `project.baseUrl`; el puerto no interviene en esa comprobación. Con el preset demo usa `127.0.0.1`, no un alias `localhost`. Se rechaza un Origin presente que no coincida con el origen solicitado. No hay CORS abierto, OAuth ni servidor stdio. Un dominio distinto requiere configurar su instalación; no basta con cambiar la URL del cliente.

## Descubrir y leer con el SDK

Desde la raíz, con `TASKI_CLIENT_CODE` y `TASKI_CLIENT_MEMBER` definidos en un entorno privado y el Worker activo:

```sh
node --input-type=module <<'JS'
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const code = process.env.TASKI_CLIENT_CODE;
const member = process.env.TASKI_CLIENT_MEMBER;
if (!code || !member) throw new Error("Define TASKI_CLIENT_CODE y TASKI_CLIENT_MEMBER");
const client = new Client({ name: "taski-example", version: "1.0.0" }, {
  versionNegotiation: { mode: "legacy" },
});
try {
  await client.connect(new StreamableHTTPClientTransport(new URL("http://127.0.0.1:8787/mcp"), {
    requestInit: { headers: { authorization: `Bearer ${code}`, "x-taski-member": member } },
  }));
  const catalog = await client.listTools();
  console.log(catalog.tools.map((tool) => tool.name));
  const result = await client.callTool({ name: "get_project", arguments: {} });
  if (result.isError) throw new Error(JSON.stringify(result.content));
  console.log({ configVersion: result.structuredContent.configVersion });
} finally {
  await client.close();
}
JS
```

Éxito esperado: ocho nombres en el orden de la tabla y `configVersion: 1` en el preset demo. El ejemplo solo lee. Las pruebas también ejecutan el recorrido con el protocolo `2026-07-28` fijado mediante `versionNegotiation: { mode: { pin: "2026-07-28" } }`. La compatibilidad legacy es sin sesión de transporte: cada petición se autentica, mientras D1 conserva datos y recibos entre peticiones.

## Ocho herramientas

Los esquemas de entrada/salida se publican en `tools/list`, desde el [contrato compartido](../src/adapters/api/contract.ts). Las entradas rechazan campos desconocidos. Las cuatro lecturas llevan `readOnlyHint: true`; las mutaciones requieren clave idempotente, y editar un ticket existente requiere `expectedVersion`.

| Herramienta | Entrada y resultado |
| --- | --- |
| `get_project` | `knownVersion` opcional; configuración y cursor actual. Si coincide, omite `project` con `notModified: true`. |
| `list_tickets` | Filtros, `limit` y cursor; 20 resúmenes por defecto, máximo 50. `view: "work"` añade metadatos de UI. |
| `get_ticket` | `key`; `view: "work"` incluye descripción completa y cinco comentarios recientes. `full` añade identidad/fechas; los comentarios anteriores se paginan. |
| `create_ticket` | `title`, `idempotencyKey` y campos opcionales; permite crear y asignar juntos. Devuelve recibo. |
| `update_ticket` | `key`, versión, clave y `changes`, `descriptionPatch` y/o `comment`; escritura atómica y recibo. |
| `add_comment` | `key`, versión, clave y `body`; recibo con `commentId`. |
| `list_activity` | Cursor, límite y `ticketKey` opcional; cambios concretos, `nextCursor` y `hasMore`. |
| `link_pull_request` | `key`, versión, clave y `url`; referencia manual auditada, sin consultar GitHub. |

Ejemplos de argumentos ficticios, para un ticket cuya versión actual sea 1:

```json
{"key":"DEMO-001","view":"work","commentsLimit":5}
```

```json
{"key":"DEMO-001","expectedVersion":1,"idempotencyKey":"avance-001","changes":{"status":"in_review"},"comment":"Listo para revisar"}
```

Consulta en la [API](api.md) las vistas, cursores, campos omitidos y recuperación incremental compartidos. Los límites de texto y las [reglas del núcleo](ticket-rules.md) también se aplican aquí. El cuerpo MCP admite hasta 1 MiB; no se trunca contenido para reducir su coste.

## Resultados y errores

Una operación correcta devuelve `{content: [], structuredContent: resultado}`: el JSON completo se transporta una sola vez. El cliente debe consumir `structuredContent`. La [especificación MCP](https://modelcontextprotocol.io/specification/2026-07-28/server/tools#structured-content) recomienda duplicarlo en texto para compatibilidad con clientes antiguos; esta implementación evita esa duplicación explícitamente. Codex CLI 0.167.2 y Claude Code 2.1.327 hicieron visible el resultado al agente en los [recorridos comprobados](verification/b6-agents.md). Un host que solo muestre `content` no es compatible; otras versiones requieren su propia verificación.

Un fallo de negocio devuelve `isError: true` y un bloque de texto JSON con `{error:{code,message}}`, sin recibo de éxito. `VERSION_CONFLICT` exige releer y reconciliar; `IDEMPOTENCY_CONFLICT` indica reutilización de clave con otros parámetros; `REVIEW_REQUIRED` impide cerrar sin autorización. Los fallos internos devuelven `INTERNAL_ERROR` sin SQL o trazas. Consulta las [garantías de reintento](retries.md): ante transporte incierto conserva clave y argumentos, sin incrementar ciegamente la versión.

El SDK responde los errores de protocolo/esquema según MCP. Antes del transporte, el acceso puede responder HTTP 401, 403, 429 o 503; un miembro desconocido responde 400. JSON malformado, tipo de contenido incorrecto y cuerpo demasiado grande responden 400, 415 y 413 respectivamente. Todas las respuestas MCP llevan `Cache-Control: no-store`.

## Evidencia y reproducción

`npm run check` ejecuta descubrimiento y las ocho herramientas con SDK cliente/servidor 2.4.0 sobre Worker/D1 emulado, en modo legacy y `2026-07-28`. Comprueba lectura cruzada HTTP/MCP, asignación, comentarios, PR, revisión, esquemas inválidos, límites, reintentos, conflictos y rollback de un fallo de auditoría. El Host rechazado se prueba directamente en la frontera porque el harness reescribe esa cabecera.

Para medir catálogo y respuestas recibidos por el SDK, instala también el entorno Python del [experimento B0](../experiments/b0/README.md) y ejecuta:

```sh
npm run mcp:measure -- --check
```

Sin argumentos imprime una medición nueva. `--write` actualiza el [informe versionado](benchmarks/b6-mcp-results.json); revisa su diff. `TASKI_PROXY_PYTHON` permite elegir otro ejecutable con las dependencias fijadas. El runner crea un D1 efímero con 20 tickets ficticios, fija el epoch de esa base para reproducir los cursores y nunca conecta con una instalación existente.

| Artefacto medido | Tokens proxy | Bytes UTF-8 | Presupuesto proxy |
| --- | --- | --- | --- |
| `tools/list` completo + instrucciones | 3101 | 12409 | 4000 |
| Resultado de listar 20 resúmenes | 805 | 2604 | 1600 |
| Recibo de crear/asignar | 63 | 200 | 200 |

Se usa JSON canónico con claves ordenadas y `tiktoken==0.14.0/o200k_base`, incluyendo los envelopes `content`/`structuredContent` del resultado SDK. Se excluyen IDs JSON-RPC y cabeceras HTTP. El catálogo es el recibido de `tools/list`, con anotaciones y esquemas de salida, no una proyección del contrato B0. El informe incluye tamaños por herramienta; eso no demuestra qué definiciones carga un host con descubrimiento diferido.

Comprobado con Node 26.3.0, npm 11.16.0 y Python 3.14.8 en macOS ARM64. CI reproduce el informe con el Node fijado del proyecto. Las cifras son proxy de estos fixtures en legacy, no consumo del modelo, latencia o comparación con Linear. Consulta también las [mediciones de B6-02](mcp-intent.md). Los [informes de B6-03](verification/b6-agents.md) registran uso y descubrimiento expuestos por cada cliente, con sus límites; el gate comparativo de B6-04 conserva su evaluación propia según el [protocolo de benchmark](benchmarks/protocol.md).
