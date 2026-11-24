# B6-03 · Evidencia de clientes reales

Recorridos ejecutados localmente con los clientes instalados, no con un agente simulado. Los archivos JSON conservan fecha, versiones, protocolo solicitado, hashes del código del servidor, herramientas, llamadas, errores, uso reportado y tamaños proxy. Cada condición contiene una sesión nueva y la continuación de esa misma sesión después de un cambio externo.

| Cliente y condición | Modelo observado | Protocolo solicitado | Llamadas nuevas / retomadas | Resultado |
| --- | --- | --- | --- | --- |
| [Codex CLI 0.170.0, predeterminado](b6-codex-default.json) | gpt-6.2-sol | 2025-06-18 | 9 / 3 | Correcto, sin errores. |
| [Claude Code 2.1.327, anticipada](b6-claude-eager.json) | claude-sonnet-5-5 | 2026-07-28 | 10 / 3 | Correcto, sin errores. |
| [Claude Code 2.1.327, diferida](b6-claude-deferred.json) | claude-sonnet-5-5 | 2026-07-28 | 10 / 3 | Correcto, sin errores. |

Los modelos son los seleccionados por los propios clientes en estas ejecuciones; no se configura una sustitución de modelo. Las condiciones no son una comparación de rendimiento entre modelos o proveedores. Una sesión nueva tampoco significa caché fría: se conserva el uso de caché observado y no se afirma haberla controlado.

## Resultado comprobado

El [runner](../../scripts/verify-mcp-agents.mjs) crea una base D1 efímera, un Worker y un proxy de observación en loopback, sin conectar a la base de desarrollo. Solo el MCP ficticio de Taski queda habilitado en la configuración explícita del cliente. La preparación y comprobación externa usan HTTP; el agente debe conseguir el resultado usando MCP.

En el primer turno se ejercitan las ocho herramientas. Se comprueban creación y asignación conjuntas, comentario, PR manual, estado + avance atómicos y lectura de detalle/actividad. El agente debe devolver el marcador final de un texto completo: ese valor aleatorio no está en el prompt. HTTP confirma versión 4, estado `in_review`, responsable `sam`, PR y dos comentarios. No se delega el cierre a `done`.

Antes del segundo turno, otro cliente añade un comentario y resalta el ticket. El runner retoma la sesión por su ID y exige reutilizar `knownVersion` y el cursor consumido, sin volver a listar tickets. Comprueba la lectura del cambio concreto, detalle completo, versión 5 y ausencia de escrituras nuevas del agente. El cursor comunicado al final debe coincidir con la última página realmente consumida.

## Los cuatro mecanismos

| Mecanismo | Evidencia local |
| --- | --- |
| Catálogo breve | Ocho herramientas en `tools/list`, bytes/tokens proxy del catálogo recibido y llamadas reales a las ocho. Claude diferido devuelve referencias de `ToolSearch`; Codex registra su modo predeterminado sin inventar flags de deferral. |
| Operaciones compuestas | Crear + asignar y estado + avance se confirman en una operación cada una; el informe conserva todas las llamadas realizadas y errores, si los hubiera. |
| Contexto reutilizado | Configuración conocida omite el catálogo de miembros; la continuación usa el cursor previo y recupera el cambio externo sin volver a listar. |
| Respuestas adecuadas | Listas/recibos compactos, resultado estructurado visible en ambos clientes y acceso efectivo al contenido completo. Los tamaños proxy se registran aparte del uso del modelo. |

La salida de los clientes no expone los esquemas exactos visibles para el modelo en cada petición. `modelVisibleDefinitionTokens` queda en `null`; el catálogo recibido y las referencias de búsqueda no se presentan como ese payload. En particular, `init.tools` en Claude enumera herramientas disponibles, no prueba por sí solo qué esquemas se cargaron en cada ronda.

Una prueba preliminar de Codex rechazó argumentos de `update_ticket` con el estado fuera de `changes`. Se aclaró la descripción de la herramienta y se repitió la matriz completa. Los informes versionados corresponden al contrato aclarado; no se deduce un porcentaje de ahorro de esa repetición ni se ocultan errores del runner si aparecen en otra muestra.

## Reproducción y alcance

Las [guías de Codex](../mcp/codex.md) y [Claude Code](../mcp/claude-code.md) incluyen conexión local, comandos y diagnóstico. Los prompts ejecutados están en [mcp-agent-prompts.mjs](../../scripts/mcp-agent-prompts.mjs). El runner usa autenticación existente de cada CLI, sin copiarla ni entregarla a Taski; solo genera un código ficticio para el Worker temporal. Los logs permanecen en el directorio temporal indicado, y los clientes conservan sus sesiones en su almacenamiento normal para poder retomarlas.

`--output` permite conservar el informe seleccionado; no publica logs crudos, cabeceras de autorización ni datos de instalaciones reales. Los hashes identifican los archivos de servidor examinados: si cambia el contrato o la forma de respuesta, repite y revisa la evidencia. Estos informes son muestras fechadas, no una promesa para cualquier versión futura del host.

El proxy local registra y bufferiza respuestas para observarlas. Por ello esta prueba valida protocolo, visibilidad y corrección, sin medir latencia de producción. Tampoco hay treinta repeticiones, comparación con Linear, p50/p95 o caché controlada. El [gate de B6-04](../benchmarks/protocol.md) conserva esas obligaciones. CI comprueba el runtime y la documentación sin ejecutar modelos ni necesitar las credenciales personales de los clientes.
