# Worker, D1 y web en Cloudflare

La [plantilla de Wrangler](../../wrangler.deploy.example.jsonc) empaqueta el Worker y la web conectada. La prueba local comprueba enlaces directos, salud, API y MCP con D1 efímero. El primer piloto remoto con datos ficticios verificó HTTPS, los enlaces a tickets, el inicio y cierre de sesión en Chromium y la creación y lectura de un ticket con el SDK de MCP.

## Ensayo local

```sh
npm run build:app
npm exec -- wrangler deploy --config wrangler.deploy.example.jsonc --dry-run
node --test tests/hosted-runtime.test.mjs
```

El Worker responde JSON en `/health`, `/api/v1/*` y `/mcp`. Sirve la web en `/` y en enlaces directos como `/t/EDIT-001`. El cliente usa la API en el mismo origen. El Worker que sirve la web requiere una configuración explícita y responde 503 si falta o es inválida.

## Preparar una instalación

1. Crea una copia como `wrangler.deploy.local.jsonc`, ignorada por Git. Usa la cuenta elegida y nombres propios para el Worker y D1. Crea una D1 para este entorno, sustituye el UUID de ejemplo y conserva bases distintas para pruebas y uso real. Aplica las migraciones con `npm exec -- wrangler d1 migrations apply DB --config wrangler.deploy.local.jsonc --remote`.
2. Prepara un JSON privado con el [esquema de instalación](../configuration.md). Usa el origen HTTPS definitivo en `project.baseUrl`, por ejemplo `https://taski.example.com`. Conserva el ID de proyecto y el prefijo cuando actualices una instalación con tickets.
3. Guarda el JSON de instalación como valor de `TASKI_INSTALLATION_JSON` y el código como `TASKI_TEAM_ACCESS_CODE` en un [archivo de secretos privado de Wrangler](https://developers.cloudflare.com/workers/wrangler/commands/workers/). Mantén deshabilitados `workers.dev` y los enlaces de preview.
4. Para un piloto abierto con datos ficticios, el dominio puede servir la pantalla de entrada directamente. Los tickets y el MCP exigen el código de Taski. Para el uso interno con datos del equipo, configura [Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) para el hostname antes de asociarlo al Worker. Autoriza los correos o el grupo del equipo y usa [tokens de servicio](https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/) con Service Auth para MCP. Los clientes MCP envían también las [cabeceras de Taski](../mcp.md#conectarse-a-una-instalación).
5. Añade el dominio a `routes` en la configuración privada. Usa una entrada como `{"pattern":"taski.example.com","custom_domain":true}`. Ejecuta `npm run build:app` y despliega con `npm exec -- wrangler deploy --config wrangler.deploy.local.jsonc --secrets-file /ruta/privada/secretos.json`.

### Imágenes adjuntas

Para habilitar imágenes, [configura un bucket R2 privado y el binding ATTACHMENTS](../attachments.md#activar-por-instalación). Usa un bucket distinto por entorno y aplica la migración D1 antes de desplegar.

## Comprobar y revertir

- Para un piloto abierto, comprueba que la pantalla de entrada esté disponible y que `/api/v1/tickets` y `/mcp` devuelvan HTTP 401 sin las credenciales de Taski. Para una instalación protegida por Access, comprueba desde una sesión externa que Access intercepte también `/` y `/api/v1/access`. Con un usuario autorizado, comprueba la entrada web y recarga un enlace directo a un ticket de prueba.
- Comprueba `GET /health` con credenciales de Access y verifica que devuelve HTTP 200 con `checks.database: ok`. Desde un cliente autorizado, ejecuta el descubrimiento MCP y `get_project`; comprueba el proyecto y catálogo de la instalación.
- Registra el ID de despliegue que verificaste. Para revertir código y assets puedes recuperar una versión compatible del Worker con [Wrangler rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/). La base y las migraciones requieren su propia comprobación antes de revertir.
