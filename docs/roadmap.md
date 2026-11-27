# Roadmap

B0 y B1 están cerrados. B1 entrega TypeScript, CI y [Worker/D1 locales](getting-started.md), con [verificación reproducible del arranque](verification/b1-onboarding.md). B2 aporta configuración y sistema visual. B3 aporta núcleo persistente y auditoría. B4 aporta acceso de equipo. B5 aporta API documentada y cliente independiente. Consulta las [decisiones y criterios de entrega](decisions/b0.md), los [issues](https://github.com/Partela-Organization/taski/issues) y los [milestones](https://github.com/Partela-Organization/taski/milestones).

B6-01 expone el [MCP autenticado](mcp.md) y comprueba las ocho herramientas con SDK. B6-02 verifica [vistas, operaciones compuestas y contexto incremental](mcp-intent.md), con recibos compactos y llamadas/rondas registradas. B6-03 añade [recorridos locales en Claude Code/Codex](verification/b6-agents.md), con sesiones nuevas y retomadas. La comparación frente a Linear optimizado sigue en B6-04; estas muestras no completan ese gate. La [web conectada B7](web.md) incorpora lista, captura, panel editable con rutas, conversación, auditoría y resaltado; B7-01/02/03 están integrados. B7-04 conserva la validación física Safari/iPhone pendiente; el preview de componentes sigue usando datos ficticios.

| Bloque | Entregable |
| --- | --- |
| B0 | Recorridos, alcance, reglas y dirección visual |
| B1 | Base TypeScript, ejecución local reproducible y documentación |
| B2 | Configuración y sistema visual intercambiables |
| B3 | Tickets, comentarios, enlaces y auditoría |
| B4 | Acceso por código y persona |
| B5 | API documentada y cliente independiente |
| B6 | MCP probado con Claude Code y Codex |
| B7 | Primera web conectada |
| B8 | Feedback sencillo |
| B9 | PR manual visible y auditable |
| B10 | Otra instalación y UI como prueba de reutilización |
| B11 | Cloudflare, recuperación y piloto |
| B12 | Primera versión funcional pública y guías validadas |

La documentación se desarrolla y comprueba durante cada bloque. B12 consolida y valida el material; no es la primera vez que se escribe. Cada PR explica lo comprobado y actualiza las guías afectadas.

## Q2 · Posterior a v0.1

Imágenes y notas de voz en R2, sticky notes de escritorio, feedback automático desde un bot de WhatsApp conectado al MCP y una guía web para conectar clientes MCP. Ver [alcance de Q2](q2.md). La fase sigue a v0.1 y tiene su propio [backlog](https://github.com/Partela-Organization/taski/milestone/14).

## Horizonte

Documentos por bloques, estilo Notion, para ideas, investigaciones y auditorías que todavía no son tareas. Se editan desde la web y se leen o escriben por MCP. Ver el [plan](horizonte.md) y la [verificación](verification/horizonte.md).

## Resumen y tracks

Taski funciona como recap rápido: un [Resumen](web.md#resumen) con lo que toca hacer, cifras y barras de progreso por track; prioridad y fecha por track; navegación por track con teclas y ⌘K; y un check de hecho en feedback. Ver el [plan por bloques](tracks.md) y la [verificación](verification/tracks.md). Quedan pendientes con el equipo la prueba en iPhone físico y confirmar el formato del texto para Telegram.
