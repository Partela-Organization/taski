# Worker, D1 y web en Cloudflare

La [plantilla de Wrangler](../../wrangler.deploy.example.jsonc) empaqueta el Worker y la web conectada. La prueba local comprueba enlaces directos, salud, API y MCP con D1 efímero. B11-01 registra la verificación remota de cada instalación.

## Ensayo local

```sh
npm run build:app
npm exec -- wrangler deploy --config wrangler.deploy.example.jsonc --dry-run
node --test tests/hosted-runtime.test.mjs
```

El Worker responde JSON en `/health`, `/api/v1/*` y `/mcp`. Sirve la web en `/` y en enlaces directos como `/t/EDIT-001`. El cliente usa la API en el mismo origen. El Worker que sirve la web requiere una configuración explícita y responde 503 si falta o es inválida.

## Preparar una instalación privada

1. Crea una copia como `wrangler.deploy.local.jsonc`, ignorada por Git. Usa la cuenta elegida y nombres propios para el Worker y D1. Crea una D1 para este entorno, sustituye el UUID de ejemplo y conserva bases distintas para pruebas y uso real. Aplica las migraciones con `npm exec -- wrangler d1 migrations apply DB --config wrangler.deploy.local.jsonc --remote`.
2. Prepara un JSON privado con el [esquema de instalación](../configuration.md). Usa el origen HTTPS definitivo en `project.baseUrl`, por ejemplo `https://taski.example.com`. Conserva el ID de proyecto y el prefijo cuando actualices una instalación con tickets.
3. Construye la web y despliega el Worker con la configuración privada. Deja sin dominio asociado este primer despliegue y mantén deshabilitados `workers.dev` y los enlaces de preview. Guarda el JSON con `npm exec -- wrangler secret put TASKI_INSTALLATION_JSON --config wrangler.deploy.local.jsonc < /ruta/privada/instalacion.json`. Guarda el código de equipo por separado con `npm exec -- wrangler secret put TASKI_TEAM_ACCESS_CODE --config wrangler.deploy.local.jsonc`.
4. Crea una aplicación [Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) que cubra todo el hostname. Autoriza los correos o el grupo del equipo. Para MCP, puedes autorizar [tokens de servicio](https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/) mediante una política Service Auth; el cliente envía también las [cabeceras de Taski](../mcp.md#conectarse-a-una-instalación). Asocia el dominio al Worker después de configurar Access.

## Comprobar y revertir

- Desde una sesión sin acceso, verifica que `/`, `/api/v1/access` y `/mcp` queden detrás de Access. Con un usuario autorizado, comprueba la entrada web y recarga un enlace directo a un ticket de prueba.
- Comprueba `GET /health` con credenciales de Access y verifica que devuelve HTTP 200 con `checks.database: ok`. Desde un cliente autorizado, ejecuta el descubrimiento MCP y `get_project`; comprueba el proyecto y catálogo de la instalación.
- Registra el ID de despliegue que verificaste. Para revertir código y assets puedes recuperar una versión compatible del Worker con [Wrangler rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/). La base y las migraciones requieren su propia comprobación antes de revertir.
