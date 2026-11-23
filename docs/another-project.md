# Instalar Taski en otro proyecto

Esta prueba usa **Estudio editorial**, con miembros, áreas, estados, marca y prefijo ficticios. Arranca en su propio origen y usa un D1 local nuevo. La instalación habitual puede seguir funcionando en paralelo.

## Preparar el estudio local

Requisitos y versiones en [desarrollo](development.md). En un clon nuevo, desde su raíz:

```sh
npm ci
npm run build:app
node --input-type=module <<'JS' > .dev.vars
import { studioPreset } from './src/config/presets/studio.ts';
studioPreset.project.baseUrl = 'http://127.0.0.1:8792';
console.log("TASKI_INSTALLATION_JSON='" + JSON.stringify(studioPreset) + "'");
console.log('TASKI_TEAM_ACCESS_CODE=studio-local-only');
JS
npm exec -- wrangler d1 migrations apply DB --config wrangler.deploy.example.jsonc --local --persist-to .wrangler/studio
npm exec -- wrangler dev --config wrangler.deploy.example.jsonc --local --ip 127.0.0.1 --port 8792 --persist-to .wrangler/studio
```

Abre `http://127.0.0.1:8792`, elige Lee y entra con `studio-local-only`. Crea una tarea de ejemplo. Debe aparecer con un código como `EDIT-001`, con **Entrada** y **Contenido** como áreas. Abre el enlace directo del ticket y vuelve a cargarlo en el mismo navegador.

## Comprobar aislamiento y MCP

1. En otro clon, arranca el [proyecto demo](getting-started.md) con un código propio en `.dev.vars`. Arranca también su [web conectada](web.md). Crea una tarea y comprueba que su clave empieza por `DEMO-`.
2. Comprueba desde ambas listas que cada instalación solo contiene su propia tarea. También puedes consultar sus APIs desde una terminal, por ejemplo:

   ```sh
   curl --fail-with-body http://127.0.0.1:8792/api/v1/tickets \
     -H 'Authorization: Bearer studio-local-only' -H 'X-Taski-Member: lee'
   ```

   Añade `/DEMO-001` a la ruta anterior. Espera HTTP 404 aunque DEMO-001 exista en el otro clon. Comprueba también `EDIT-001` en el demo con el código y miembro de esa instalación.

3. Conecta un [cliente MCP](mcp.md) a `http://127.0.0.1:8792/mcp` con el código de Studio y `X-Taski-Member: lee`. Ejecuta `get_project` y comprueba que devuelve `studio` y el prefijo `EDIT`. Usa `get_ticket` con `EDIT-001` para abrir el ticket de prueba.
4. Sigue la [guía de personalización](customization.md) para sustituir la presentación del estudio y repetir la apertura del enlace directo sobre la misma base.

Para alojar la segunda instalación, elige su hostname y prepara un Worker y D1 propios con la [plantilla de despliegue](deployment/cloudflare.md). Usa su URL HTTPS en el preset. El código de ejemplo de esta página solo sirve para el entorno local.

## Verificación registrada

En macOS con Node 26.3.0, Wrangler 4.161.0 y Chromium de Playwright 1.65.0 se ejecutaron dos Workers locales con orígenes y directorios D1 separados. La web creó `EDIT-001` y conservó su enlace al recargar. La API de cada instalación mostró solo su propio ticket y devolvió 404 para la clave de la otra y 401 con sus credenciales. El SDK MCP abrió los proyectos y tickets de cada base. Al cambiar el nombre de marca y servir Mesa editorial, se conservó el enlace, se pudo iniciar otra sesión y las definiciones MCP y los datos del ticket coincidieron con los originales. Un ensayo adicional con `https://studio.example:8794`, resuelto a loopback y con un certificado local, comprobó entrada, creación y enlace directo en el hostname configurado.

Para la comprobación independiente, pide a otra persona que siga estas dos guías desde un clon limpio. Registra en [#30](https://github.com/Partela-Organization/taski/issues/30) si arrancó Studio, creó el ticket y abrió el mismo enlace después de cambiar la interfaz. Incluye cualquier paso que haya requerido ayuda.
