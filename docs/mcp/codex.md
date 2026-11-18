# Taski en Codex CLI

Validado con Codex CLI 0.167.2 y su modelo predeterminado observado `gpt-6.2-sol`, sobre Worker/D1 local. El [informe](../verification/b6-codex-default.json) registra una sesión nueva y su continuación real; no es una simulación con SDK ni una comparación entre modelos.

## Conectar una instalación local

Arranca el Worker y configura su código según [MCP](../mcp.md). Define `TASKI_CODE` y `TASKI_MEMBER` en el entorno privado de la terminal que abre Codex. El código debe coincidir con el del Worker y el miembro debe ser un ID de su configuración. `.dev.vars` configura Wrangler, pero no exporta esas variables a otra terminal.

Integra este bloque en tu configuración local de Codex (`~/.codex/config.toml`), sin guardar valores reales en el repositorio:

```toml
[mcp_servers.taski]
url = "http://127.0.0.1:8787/mcp"
bearer_token_env_var = "TASKI_CODE"
env_http_headers = { "X-Taski-Member" = "TASKI_MEMBER" }
http_headers = { "X-Taski-Client" = "codex" }
required = true
```

La [documentación oficial de MCP en Codex](https://developers.openai.com/codex/mcp/) describe esos campos. `codex mcp list` permite revisar la conexión configurada. No ejecutes `codex mcp login taski` para este acceso: Taski usa código Bearer, sin OAuth.

Abre Codex y pide consultar proyecto, miembros y tickets. Debe usar `get_project` y `list_tickets`, sin inventar datos cuando un resultado sea vacío. Para crear y asignar basta una llamada a `create_ticket`; una edición usa `expectedVersion` y `idempotencyKey`. Los campos editables de `update_ticket` van dentro de `changes`, por ejemplo `changes: {status: "in_review"}`. `comment` permite dejar el avance en la misma escritura. Ver [herramientas y errores](../mcp.md).

## Reproducir el recorrido verificado

Requisitos: dependencias npm y entorno Python proxy del [spike B0](../../experiments/b0/README.md), Codex instalado y `codex login status` correcto. La autenticación de Codex permanece en su propio almacén; no se copia al repo ni al servidor Taski.

```sh
node scripts/verify-mcp-agents.mjs --client codex
```

El runner crea un Worker/D1 efímero, un proxy local de observación y un directorio de trabajo nuevo. Arranca `codex exec --json` con configuración explícita solo para ese MCP, ignorando la configuración de usuario para esta evaluación. Desactiva shell, delegación, plugins, conectores adicionales y web; conserva el sandbox de solo lectura para archivos. La aprobación de operaciones MCP se limita al servidor ficticio del runner. No cambia la configuración global de Codex.

El primer turno consulta proyecto y tickets, lee contenido completo con un marcador no incluido en el prompt, crea/asigna, comenta, enlaza PR y deja estado + avance atómicos en revisión. El runner confirma los datos mediante HTTP. Después simula un cambio desde otro cliente y ejecuta `codex exec resume` sobre la misma sesión. Codex debe reutilizar versión de configuración y cursor, leer solo la actividad nueva y confirmar el detalle actualizado sin escribir.

Éxito esperado: JSON final del runner con `passed: true`, ruta del informe y logs temporales. La muestra final registró nueve llamadas MCP en contexto nuevo y tres al retomar, sin errores; el protocolo solicitado fue `2025-06-18`, atendido por la compatibilidad legacy del servidor.

La salida JSONL registra llamadas y resultados; el payload de `structuredContent` aparece como `structured_content` en los eventos de Codex y fue visible para el agente. La muestra obtuvo el marcador exacto del contenido y la modificación externa real. No se añade una copia de todo el JSON a `content`.

## Descubrimiento y uso reportado

Esta versión se evaluó con su descubrimiento predeterminado. Se observó `tools/list` con las ocho herramientas y ejecución directa; JSONL no expone los esquemas exactos cargados en el contexto del modelo. El informe deja ese tamaño en `null`. No se fuerzan flags eliminados para fabricar una condición de carga diferida.

Los contadores de `turn.completed` observados son acumulados de sesión: el informe conserva sus valores y obtiene el incremento de la continuación por resta, sin sumar de nuevo el total anterior. `cached_input_tokens` ya forma parte de `input_tokens`. Es uso reportado por el cliente; los tamaños proxy de objetos RPC se guardan aparte. La [referencia de ejecución no interactiva](https://developers.openai.com/codex/noninteractive/) explica JSONL y continuación por ID.

Los logs del cliente y su sesión persistida contienen solo el recorrido ficticio de esta evaluación. El runner imprime la ruta temporal y publica únicamente métricas y metadatos seleccionados con `--output`; los logs crudos no forman parte de las guías. No se hacen llamadas con modelos o credenciales de CI.

## Diagnóstico

- Fallo de arranque del MCP: confirma Worker activo, migraciones y URL `/mcp`; el preset demo exige `127.0.0.1` en lugar de un alias de Host.
- 401/403: revisa código, miembro y variables exportadas en el proceso cliente. Una cookie web no sustituye las cabeceras de agente.
- Parámetros rechazados: consulta el esquema y conserva el texto del error; no adivines aliases como `fields`, `set` o `patch` para los campos de edición.
- `VERSION_CONFLICT`: relee y reconcilia. Un reintento incierto conserva clave y argumentos; no incrementa la versión a ciegas.
- Sin acceso al proveedor del modelo: comprueba `codex login status` en tu terminal. Una conexión MCP correcta no prueba acceso al modelo.
