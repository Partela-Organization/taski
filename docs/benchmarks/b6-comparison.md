# B6-04 · Preparación y evaluación de la comparación

**Estado: benchmark pendiente; ninguna ventaja demostrada.** Hay un diseño registrado, un generador del orden de ejecución, un evaluador y una comprobación de acceso de los clientes. No hay todavía un colector que ejecute la suite comparativa ni muestras de rendimiento equivalentes. El [issue #21](https://github.com/danirssx/taski/issues/21) permanece abierto. Las [validaciones B6-03](../verification/b6-agents.md) no son muestras de esta comparación.

La [comprobación fechada de acceso](b6-prerequisites.json) conserva solo versiones y estado de conexión. Codex accede a Linear mediante su OAuth existente; Claude necesita autorizar `linear-server`. El endpoint oficial y su autenticación están documentados por [Linear](https://linear.app/docs/mcp). El probe llama únicamente `get_workspace`; no crea proyectos o tickets, ni incluye identidad del workspace en el informe. Cada CLI usa su autenticación nativa; no se trasladan credenciales entre clientes.

## Diseño registrado antes de medir

El [diseño ejecutable](../../scripts/benchmark-design.mjs) fija las condiciones y su SHA-256. Modificarlo cambia `designDigest`; el evaluador rechaza mezclar muestras de otra revisión del diseño.

- Codex con descubrimiento predeterminado; Claude con carga anticipada y diferida.
- Contexto nuevo y previo, separados en seis cohortes; caché no controlada, con contadores observados.
- Nueve variantes: listados de 10/20 y los otros siete recorridos del [protocolo](protocol.md). Los dos listados pesan 0,5 cada uno; las otras familias pesan 1. No se reajustan pesos según resultados.
- Treinta pares por variante y cohorte; alternancia Taski/Linear en cada repetición. Son 3240 intentos de tarea para la matriz completa, sin contar preparación y restauración.
- Uso real: media por escenario y suma ponderada entre escenarios de una misma cohorte. No se suman modelos, condiciones de carga o contexto diferentes.
- Latencia: percentiles por rango más cercano, incluyendo descubrimiento, recuperación y confirmación; preparación/restauración separadas. Cada flujo compuesto debe mejorar p50 al menos un 20 %, además de alcanzar el 25 % de ahorro agregado de tokens reales y corrección igual o mejor.

```sh
npm run benchmark:plan -- --output /tmp/taski-benchmark-plan.json
npm run benchmark:preflight -- --client both --output /tmp/taski-prerequisites.json
```

`plan` solo genera el registro y su calendario; no llama modelos ni servicios. `preflight` sí invoca los clientes instalados/autenticados, con configuración MCP explícita, shell/archivos/delegación deshabilitados y una sola lectura de workspace por cliente. Usa los nombres `linear` en Codex y `linear-server` en Claude para aprovechar su autorización nativa existente. Guarda logs privados en el directorio temporal anunciado, con permisos de archivo restringidos; solo el informe seleccionado excluye contenido del workspace. Devuelve código 2 si falta alguna conexión. Un modelo diciendo que conecta no basta: debe existir un resultado exitoso de la herramienta en los eventos del cliente.

## Evaluar registros medidos

El [evaluador](../../scripts/benchmark-evaluate.mjs) recibe un JSON por línea. No ejecuta la comparación ni convierte el JSON de B0/B6-01/02/03 a supuestos resultados reales.

```sh
npm run benchmark:report -- --input /tmp/taski-live-runs.jsonl --output /tmp/taski-comparison.json
```

Cada registro debe proceder de una tarea real y contener:

| Campos | Contenido y condición |
| --- | --- |
| `kind` | `LIVE_COMPARATIVE_RUN`; los ejemplos y proxies no son muestras. |
| `runId`, `pairId`, `provider`, `scenario`, `repetition`, `position` | Identificación única y valores exactos del calendario generado. No se permiten duplicados ni muestras fuera del diseño. |
| `host`, `loading`, `context`, `designDigest` | Condición registrada y hash del diseño. |
| `commit`, `fixtureSha256`, `promptSha256`, `traceSha256` | Commit completo y hashes de fixtures, prompt y traza saneada. La identidad del contenido ficticio debe coincidir en la cohorte. |
| `model`, `hostVersion`, `connectorVersion` | Versiones observadas. Modelo/host constantes dentro de la cohorte; conector estable por proveedor. |
| `server` | Objeto con `identity`, `version`, `region`, `environment`: `remote-test` para la comparación desplegada. `local` permite explorar, pero deja el gate sin demostrar. Usar alias públicos para identificar instalaciones de prueba. |
| `cache`, `comparator` | `uncontrolled-observed` y `optimized`. Documentar además los campos, límites, patches y paralelización usados. |
| `startedAt`, `confirmedAt`, `latencyMs`, `setupMs`, `restoreMs` | Fechas ISO desde instrucción a confirmación externa y duración coincidente; preparación/restauración independientes. Los pares deben respetar el orden temporal registrado. |
| `correct`, `failure`, `errors`, `retries`, `calls`, `rounds` | Resultado confirmado contra fixtures y llamadas reales. `rounds` cuenta lotes no vacíos de llamadas, incluyendo descubrimiento si implica herramientas; no puede exceder `calls`. `failure` es `null` o una categoría saneada; obligatorio si falla. Los intentos fallidos permanecen en distribuciones y consumo. |
| `usage` | Contadores reales por invocación según la semántica siguiente; `null` cuando no están disponibles. |
| `payloadProxy` | `argumentBytes`, `resultBytes`, `argumentTokens`, `resultTokens` medidos por separado; nunca sustituyen `usage`. |
| `evidence` | Referencias SHA-256 de artefactos para `loaded-definitions`, `composed-operations`, `context-reuse`, `compact-and-full`, o `null` cuando falte evidencia. Requieren revisión del contenido real. |

Los hashes son referencias de procedencia, no una certificación automática de verdad. Los artefactos deben conservar datos ficticios suficientes para revisar equivalencia, optimización y mecanismos; una captura de catálogo recibido no prueba las definiciones realmente cargadas. No rellenar ese campo con un artefacto que solo diga que la medición no está disponible. Las cabeceras, tokens de acceso, datos personales y contenido privado no pertenecen al JSONL ni a los artefactos públicos. El evaluador no sanea texto privado automáticamente.

### Contadores de uso

`usage` exige `source: "client"` y `scope: "invocation"`. En Codex contiene `input_tokens`, `output_tokens`, `cached_input_tokens`; el total es entrada + salida porque la entrada ya incluye la parte cacheada. En Claude contiene `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`; el total incluye los cuatro porque la entrada de ese contador excluye caché. El informe mantiene cada contador separado.

Los acumulados de sesión no se aceptan como uso de una tarea. El futuro colector debe derivar incrementos de snapshots fiables y conservar su procedencia. En particular, no reutilizar sin más los acumulados de las continuaciones B6-03. Si el host no permite establecer la semántica o faltan contadores, entregar `usage: null`; no rellenar con cero o con el tokenizer proxy. El evaluador conserva los otros datos y marca consumo no disponible.

### Resultado del evaluador

- `NOT_DEMONSTRATED`: falta cualquier muestra/pareja/uso real/evidencia requerida, cambian versiones o se mide contra servidor local. Un archivo vacío también produce este resultado.
- `TARGETS_NOT_MET`: hay matriz completa, pero alguna cohorte incumple tokens, p50 de un flujo compuesto o corrección.
- `TARGETS_MET_REVIEW_REQUIRED`: los umbrales numéricos se cumplen, pendientes de revisar artefactos, equivalencia, ejecución y regresiones p95. No acepta automáticamente B6-04.

Los dos primeros estados producen código de salida 2; errores de formato o registros inválidos terminan con error. Se publican n, media, min/max, desviación estándar, p50/p95, fallos, reintentos, uso y payload por escenario/cohorte, además de regresiones p95 aunque los umbrales pasen. El estado global conserva cualquier cohorte pendiente o fallida; no permite ocultarla con un agregado favorable.

## Trabajo restante para el gate

Autorizar ambos clientes, preparar una instalación remota de prueba de Taski y un proyecto aislado en Linear, importar los mismos fixtures ficticios y documentar los mapeos. El colector pendiente deberá verificar resultados contra los datos reales, registrar prompts/configuración/versiones y respetar el calendario; no se ha lanzado la matriz de 3240 tareas. Después: publicar las muestras saneadas y artefactos, revisar la comparación optimizada, evaluar metas y decidir explícitamente sobre cada regresión. Esta preparación no cierra B6-04 ni demuestra superioridad.
