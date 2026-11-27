# Adaptador MCP

`server.ts` expone las once herramientas por Streamable HTTP en `/mcp`, con acceso de agente, esquemas compartidos con HTTP y persistencia/auditoría D1 a través del mismo núcleo. El SDK y el validador compatibles con Worker viven solo en el adaptador; no se importa el spike Python. Ver [configuración, herramientas y evidencia](../../../docs/mcp.md). La comprobación de Claude Code y Codex sigue pendiente en B6-03.
