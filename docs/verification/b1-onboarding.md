# Validación del onboarding B1

Vinculada a [B1-03 / #7](https://github.com/Partela-Organization/taski/issues/7). La infraestructura de B1-01/B1-02 está implementada. B1 se cerró por decisión del mantenedor con la evidencia automática disponible.

## Evidencia automática registrada

Checkout limpio del commit `ebf34b5dc64b5caadbf93d72087003e5e3f561bb` (cambios de B1-02, integrados en [PR #52](https://github.com/danirssx/taski/pull/52)):

- macOS 26.5.2 ARM64, Node 26.3.0, npm 11.16.0.
- `npm ci` sin reutilizar `node_modules` y con lockfile intacto.
- `db:migrate`, `db:check`, tipos, fronteras, seis pruebas y bundle correctos.
- Checks documentales: 24 documentos/76 enlaces y baseline de B0 consistente.
- Dos arranques de desarrollo: `/health` HTTP 200 y D1 conservado tras reiniciar.
- Checkout sin cambios de archivos versionados después de ejecutar los pasos.
- CI de [PR #52](https://github.com/danirssx/taski/pull/52) correcto en Ubuntu, Node 24.11.1 y 26.3.0, sin secretos.

La prueba encontró que fijar el puerto en el script impedía el override documentado; se movió ese valor al config de Wrangler y se repitió el flujo completo con resultado correcto.

## Reproducir la verificación

Desde un checkout limpio y con sus cambios ya commiteados:

```sh
npm run onboarding:check
```

El script usa únicamente Node/Git para clonar el `HEAD` actual en una carpeta temporal. Dentro ejecuta `npm ci`, las migraciones/consulta locales, `check`, checks documentales y dos arranques independientes con consulta de salud. Comprueba que no queden cambios versionados y elimina solo su clon temporal al terminar. No reutiliza la base de desarrollo, publica nada ni requiere una cuenta Cloudflare. La primera instalación necesita acceso al registro npm.

Si hay cambios sin commit, se detiene antes de crear el clon para evitar verificar una versión distinta de la que se está revisando. El informe final incluye commit, Node/npm, sistema y arquitectura. No se incluyen rutas personales o credenciales en el informe público.

## Decisión de cierre

El mantenedor aceptó el arranque reproducible desde un clon limpio y el CI como evidencia suficiente para cerrar B1. La prueba original de otra persona siguiendo el README quedó sin ejecutar.
