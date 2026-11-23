# Personalizar una instalación de Taski

| Qué quieres cambiar | Dónde hacerlo |
| --- | --- |
| Nombre, personas, áreas o rótulos | [Configuración de instalación](configuration.md). Mantén los IDs de las entidades existentes y aumenta `configVersion`. |
| Acentos claro y oscuro | Configura `brand.accentLight` y `brand.accentDark`. La web conectada los toma del proyecto. |
| Tipografía, iconos, logotipo o estructura visual | Cambia `src/web` o sirve un presentador propio construido sobre el [cliente TypeScript](client.md). |
| Dónde se guardan tickets y sesiones | La implementación actual usa D1 en el adaptador Worker. Un proveedor distinto requiere un adaptador que preserve identidad, orden, auditoría, atomicidad y reintentos. |

## Probar una interfaz alternativa

Primero crea `EDIT-001` con la [segunda instalación](another-project.md). Guarda su enlace y detén su Worker con Ctrl+C. La [Mesa editorial](../examples/studio/index.html) es una vista de lectura que usa sesiones y el mismo cliente HTTP. Muestra los diez tickets más recientes y abre sus enlaces directos. Incluye un logotipo tipográfico y una composición propios.

```sh
npm exec -- vite build examples/studio --outDir ../../dist/studio --emptyOutDir
node --input-type=module <<'JS' > wrangler.deploy.local.jsonc
import { readFileSync } from 'node:fs';
const config = JSON.parse(readFileSync('wrangler.deploy.example.jsonc', 'utf8'));
config.assets.directory = 'dist/studio';
console.log(JSON.stringify(config, null, 2));
JS
npm exec -- wrangler dev --config wrangler.deploy.local.jsonc --local --ip 127.0.0.1 --port 8792 --persist-to .wrangler/studio
```

Abre la portada y el enlace de `EDIT-001`. Cambia únicamente la presentación. La misma sesión, base, API y MCP siguen sirviendo al estudio. La muestra ofrece lectura; la web completa sigue siendo la que permite crear y editar.

Para cambiar la marca con datos existentes, actualiza `brand` y los rótulos sin cambiar `project.id` ni `project.prefix`. Reinicia y vuelve a abrir el enlace original. Si también necesitas un prefijo distinto, conserva los enlaces mediante los aliases del [procedimiento de rotación](data-model.md#rotación-administrativa-de-prefijo). Para cambiar de hostname, conserva el origen anterior o añade redirecciones de enlaces.
