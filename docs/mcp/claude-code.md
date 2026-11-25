# Taski en Claude Code

Validado con Claude Code 2.1.327 y su modelo predeterminado observado `claude-sonnet-5-5`, en sesiones nuevas y retomadas, con carga anticipada y diferida. Los [informes anticipado](../verification/b6-claude-eager.json) y [diferido](../verification/b6-claude-deferred.json) contienen resultados reales sobre Worker/D1 local.

## Conectar una instalación

En la web de Taski, [Conectar MCP](../web.md#conectar-mcp-desde-el-encabezado) genera una configuración con la URL de la instalación y el ID del miembro seleccionado. Carga `TASKI_CODE` en la terminal. La variante reutilizable de esta página toma el ID de `TASKI_MEMBER`.

Para una instalación alojada, usa la URL HTTPS `/mcp` que te dé el equipo. Para una prueba local, arranca el Worker según [MCP](../mcp.md) y usa `http://127.0.0.1:8787/mcp`. En la terminal de Claude Code define `TASKI_CODE` y `TASKI_MEMBER` desde tu entorno privado. Deben coincidir con el código del Worker y un ID de miembro configurado. El `.dev.vars` de Wrangler no exporta variables al cliente.

Configura el servidor HTTP, por ejemplo mediante un `.mcp.json` con referencias de entorno:

```json
{
  "mcpServers": {
    "taski": {
      "type": "http",
      "url": "https://taski.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${TASKI_CODE}",
        "X-Taski-Member": "${TASKI_MEMBER}",
        "X-Taski-Client": "claude-code"
      }
    }
  }
}
```

La [referencia oficial MCP](https://code.claude.com/docs/en/mcp) documenta expansión de entorno y servidores HTTP. `/mcp` dentro de Claude permite revisar el estado. Mantén las aprobaciones normales de tu instalación; no guardes código o identidad reales en el JSON público.

Pide consultar proyecto, miembros y tickets. Para trabajar, `get_ticket` devuelve descripción y comentarios recientes; `full` añade identidad y fechas. Los resultados estructurados fueron visibles para Claude: el cliente convierte el contenido a texto para el modelo sin exigir al servidor duplicar todo el resultado. Una lista vacía debe informarse como vacía.

## Reproducir sesiones nuevas y retomadas

Instala las dependencias npm y el entorno Python proxy de [B0](../../experiments/b0/README.md). Usa una sesión válida de Claude Code; el runner conserva la autenticación nativa del cliente y no la copia. No usa `--bare`, que exige otra vía de autenticación en la versión probada.

```sh
node scripts/verify-mcp-agents.mjs --client claude --loading eager
node scripts/verify-mcp-agents.mjs --client claude --loading deferred
```

Cada comando crea su propia base efímera y directorio nuevo. El cliente se ejecuta con `--restricted`, `--strict-mcp-config`, configuración MCP explícita y solo `ToolSearch` más el MCP de Taski disponibles; los hooks de usuario y proyecto se desactivan para la evaluación. Las reglas de aprobación del runner permiten únicamente las herramientas de ese servidor ficticio. La evaluación no modifica la configuración global ni los tickets de una instalación existente.

El primer turno ejecuta las ocho herramientas: consultar, crear y asignar, añadir comentario, enlazar PR, pasar a revisión con avance atómico y confirmar detalle/actividad. Debe recuperar el marcador final de una descripción completa sin conocerlo desde el prompt. Tras un cambio externo de prueba, el runner retoma la misma sesión con `--resume`, exige `knownVersion` y el cursor consumido previamente, y comprueba el nuevo comentario y resaltado sin nuevas escrituras.

Éxito esperado: `passed: true` y rutas del informe y logs temporales. En las muestras finales ambos modos registraron diez llamadas MCP en el primer turno y tres al retomar, sin errores. El cliente usó el protocolo `2026-07-28`; las ocho herramientas estuvieron disponibles, incluida la edición compuesta.

## Qué se observó de la carga

El runner usa `ENABLE_TOOL_SEARCH=false` para carga anticipada y `true` para diferida. En el primer modo no se observó búsqueda; en el segundo, `ToolSearch` devolvió referencias a las ocho herramientas de Taski. La lista `init.tools` indica disponibilidad y no debe confundirse con los esquemas cargados en cada petición al modelo. Los informes conservan referencias devueltas y consultas de búsqueda, también al retomar.

El cliente no expone en esta salida el payload exacto de esquemas visible para el modelo: su conteo queda en `null`. Los bytes/tokens del catálogo recibido por el cliente y los resultados RPC se miden como proxy independiente; no se atribuye todo el catálogo a cada turno. Cualquier transformación de esquema del cliente pertenece a su representación, no al contrato original del servidor.

Se conservan los campos de uso expuestos por Claude con entrada, salida, creación y lectura de caché separados. No se suman totales de sesiones retomadas ni costes acumulados para deducir ahorro. El [modo programático oficial](https://code.claude.com/docs/en/headless) describe `-p`, salida estructurada y continuación; esta evaluación sigue siendo una muestra por condición, sin p50/p95 ni comparación con otro modelo.

## Diagnóstico

- Sin herramientas: revisa `/mcp`, URL y variables del proceso. El descubrimiento también exige código y miembro.
- 401: el código de Taski no es el token de Claude; no uses `ANTHROPIC_AUTH_TOKEN` como cabecera de este MCP.
- 403: confirma Host/Origin y usa `127.0.0.1` con el preset demo.
- DNS o error 1010 de Cloudflare: consulta el [diagnóstico de red](../mcp.md#diagnóstico-de-red-y-cloudflare).
- Herramienta excluida o error de esquema: revisa el mensaje del cliente y sus versiones. La versión probada conservó `update_ticket` con su validación de entrada; el servidor sigue rechazando combinaciones inválidas.
- Conflicto de versión o cursor: relee/reconcilia o resincroniza con un cursor nuevo, según [MCP](../mcp.md). Nunca inventes el recibo de una escritura rechazada.
- Fallo de acceso al modelo: revisa la autenticación normal de Claude Code desde tu terminal. Un código de Taski válido no autentica al proveedor del modelo.
