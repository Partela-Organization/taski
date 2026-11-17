# Arranque local

El arranque de B1 permite ejecutar un Worker y una base D1 local. Sobre esa base ya están disponibles tickets, acceso de equipo, [API HTTP](api.md), [cliente TypeScript](client.md) y [MCP probado con SDK](mcp.md). Esta guía comprueba la disponibilidad mediante `GET /health`; la web conectada sigue pendiente.

## Requisitos

- Git, Node 24.11.1 y npm 11. `.nvmrc` fija Node 24.11.1 si usas nvm. También se comprueba Node 26.3.0 en CI; se admite la rama 26 desde esa versión.
- Python 3.10 o superior para checks documentales. El spike B0 usa su entorno Python aparte.
- Acceso a npm para instalar las dependencias fijadas en el lockfile. No necesitas cuenta Cloudflare, token, dominio, bucket ni código de equipo para este arranque.

## Checkout y base

```sh
git clone https://github.com/danirssx/taski.git
cd taski
npm ci
npm run db:migrate
npm run db:check
```

Las migraciones crean `taski_bootstrap` y las tablas vacías de tickets, auditoría y acceso, sin datos de ningún equipo. `db:check` debe devolver `bootstrap_version: 1`. Volver a ejecutar `db:migrate` conserva la base y no repite migraciones aplicadas. Wrangler puede pedir confirmación de la migración local en una terminal interactiva; no modifica recursos remotos.

## Ejecutar y comprobar

```sh
npm run dev
```

Espera `Ready on http://127.0.0.1:8787`. Desde otra terminal, en la carpeta del proyecto:

```sh
curl --fail-with-body http://127.0.0.1:8787/health
```

Respuesta con HTTP 200:

```json
{"service":"taski","status":"ok","checks":{"database":"ok"}}
```

Detén con Ctrl+C. Al arrancar de nuevo, `npm run db:check` y `/health` deben seguir funcionando: la base se guarda en `.wrangler/state`, excluido de Git. No se guarda en memoria del Worker ni en un Durable Object que debas configurar.

## Qué significa `/health`

Es una comprobación de disponibilidad: realiza una lectura real de D1 y exige el marcador de inicialización. Si la base no está preparada, responde HTTP 503 con `status: unavailable` y `checks.database: unavailable`. No expone el mensaje SQL interno. Las respuestas no se cachean. Otros métodos de `/health` reciben 405 y las rutas desconocidas reciben 404.

Este endpoint solo prueba el Worker, su binding y el marcador de inicialización. No comprueba por sí mismo los recorridos de tickets, sesiones o MCP; las pruebas de integración verifican esos comportamientos con D1 emulado.

## Configuración incluida

[wrangler.jsonc](../wrangler.jsonc) usa un nombre neutro y un UUID ficticio para el binding `DB`, con `remote: false`. Todos los comandos de base incluidos usan `--local`; `dev` también fuerza modo local. No hay account ID, secreto o recurso del equipo que sustituir para comprobar `/health`. Para usar tickets o MCP, configura el código local en `.dev.vars` según [acceso](access.md).

Para una futura instalación remota se creará su propia base/configuración en B11. No utilices este UUID de ejemplo como si fuera una base real, ni cambies a modo remoto para resolver un problema local. La [configuración de B2](configuration.md) selecciona el preset demo con datos ficticios.

## Verificación antes de contribuir

```sh
npm run check
npm run docs:check
git diff --check
```

`check` ejecuta tipos, fronteras, pruebas de configuración/runtime y bundles locales. Las pruebas de integración usan el [test harness oficial de Wrangler](https://developers.cloudflare.com/workers/testing/test-harness/get-started/), ejecutan el Worker y las migraciones sobre D1 emulado en almacenamiento temporal aislado; no tocan tu base de desarrollo. Comprueban falta de migración, reaplicación, lectura/alteración real y recuperación. No requieren secretos.

Los checks documentales validan enlaces y aritmética de B0. Si modificas el spike Python, ejecuta también [sus instrucciones](../experiments/b0/README.md). Consulta [desarrollo](development.md) para estructura, dependencias y CI, o [solución de problemas](troubleshooting.md) si algún paso falla.
