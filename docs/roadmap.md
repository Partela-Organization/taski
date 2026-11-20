# Roadmap

Estado: B0 completado; B1 tiene TypeScript, CI y [Worker/D1 locales](getting-started.md), con revisión independiente de onboarding pendiente en [B1-03](verification/b1-onboarding.md). B2 aporta configuración/sistema visual; B3, núcleo persistente y auditoría; B4, acceso de equipo; B5, API documentada y cliente independiente. Ver [decisiones y criterios de entrega](decisions/b0.md), [issues](https://github.com/danirssx/taski/issues) y [milestones](https://github.com/danirssx/taski/milestones).

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

Imágenes, notas de voz en R2, SwiftUI y sticky notes de escritorio integradas con la web. Ver [alcance de Q2](q2.md). No implica un trimestre calendario ni cambia el alcance actual de B1.
