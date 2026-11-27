# Horizonte · Plan por bloques

Horizonte reúne lo que el proyecto hará más adelante: ideas, investigaciones y auditorías que todavía no son tareas. Cada entrada es un documento por bloques, al estilo de Notion: títulos, texto, listas, tareas, citas, código y tablas. Personas y agentes pueden leerlo y escribirlo, y cuando una idea madura se convierte en tracks y tareas. Cada bloque se entrega en su propio PR con pruebas, documentación y `npm run check`.

| Bloque | Estado |
| --- | --- |
| H1 · Núcleo, API y MCP | Implementado: [Horizonte en la API](api.md#horizonte) y [MCP](mcp.md#catorce-herramientas) |
| H2 · Sección en la web | Implementado: [Horizonte en la web](web.md#horizonte) |
| H3 · Contenido y despliegue | Pendiente |
| H4 · Verificación | Pendiente |

## Conceptos

- **Documento**: título, estado, track opcional y una lista de bloques. Se guarda con versión; dos ediciones a la vez no se pisan.
- **Estados**: Idea (`idea`), Explorando (`exploring`), Planificado (`planned`) y Archivado (`archived`).
- **Bloques**: `p` (texto), `h1`–`h3`, `li` y `ol` (listas, con sangría 0–3), `todo` (tarea con casilla), `quote`, `code`, `table` y `divider`. El formato dentro del texto (`**negrita**`, `` `código` ``, enlaces) se guarda como Markdown.
- **Markdown**: un documento entra y sale como Markdown. Un `# Título` al principio fija el título. Así se importa una nota del vault y un agente lo lee sin conocer los bloques.

## H1 · Núcleo, API y MCP

- Migración `0010_horizon.sql`: `horizon_docs` (bloques en JSON, versión y borrado lógico) y `horizon_activity`, que es solo de alta.
- Dominio `src/domain/horizon.ts`: validación de bloques, conversión Markdown ↔ bloques y resumen para listas.
- `HorizonService`: crear y editar con versión y clave idempotente; personas y agentes pueden. Solo una persona elimina.
- HTTP `/api/v1/horizon` y MCP `list_horizon`, `get_horizon` y `save_horizon`. El presupuesto proxy del catálogo MCP sube de 4000 a 4500 tokens.

## H2 · Sección en la web

- **Horizonte** en la navegación, con una lista agrupada por estado, extracto, tareas hechas y filtro por track.
- Editor por bloques como en Documentos de Conti:
  - menú `/`;
  - atajos `#`, `##`, `-`, `1.`, `[]` y `>`;
  - Enter, Backspace y flechas entre bloques;
  - autoguardado con versión y conflicto visible.
- Tablas y formato en línea al leer, y Markdown al editar.
- **Importar .md**, para pegar o elegir un archivo, y **Copiar Markdown**.

## H3 · Contenido y despliegue

- Aplicar `0010_horizon.sql` y desplegar.
- Primeros documentos: la auditoría de concurrencia, la idea de escanear facturas para generar el pedido y el análisis de las sticky notes de Taski.

## H4 · Verificación

Recorrido con datos ficticios en escritorio y teléfono, capturas y cierre del plan.
