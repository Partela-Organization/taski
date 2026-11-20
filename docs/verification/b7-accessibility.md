# B7-04 · Temas, teclado y responsive

La web conectada ofrece claro, oscuro y sistema; guarda únicamente la preferencia de tema en el navegador. El panel es no modal en escritorio y diálogo completo en móvil, con Escape, retorno de foco y contención de Tab. Resaltado y estados tienen texto, además de color. Los controles móviles principales tienen altura mínima de 44 píxeles CSS.

## Matriz de verificación

| Entorno | Cobertura | Estado |
| --- | --- | --- |
| Chromium, escritorio | Claro/oscuro/sistema, persistencia de tema, Enter/Escape, retorno de foco | Aprobado en Chromium local y CI. |
| Chromium, 390 × 844 | Diálogo completo, Tab, overflow y controles táctiles | Aprobado en Chromium local y CI. |
| Playwright WebKit, escritorio y 390 × 844 | Misma suite sobre motor WebKit | Aprobado en CI Linux; no equivale a Safari/iPhone físico. |
| Safari en iPhone físico | Teclado virtual, scroll/foco, barra del navegador y toque real | Pendiente. No hay iPhone físico disponible en esta sesión. |
| Lector de pantalla | Orden/nombres y anuncio de errores con VoiceOver | Pendiente de evaluación manual. |

`npm exec playwright install chromium webkit` instala los motores. `npm run test:ui` ejecuta la suite con fixtures ficticios, Worker/D1 efímero y ambos servidores Vite. La prueba de apariencia produce `mobile-dark.png` en el directorio de resultados de cada proyecto; los screenshots no contienen datos reales. CI instala ambos motores y ejecuta la misma configuración. La concurrencia se limita a dos workers para reducir presión sobre el entorno local.

El dispositivo enumerado por las herramientas locales es un iPad sin túnel disponible, no un iPhone utilizable para esta comprobación. No se ha sustituido la prueba física por un viewport emulado. El issue B7-04 permanece abierto hasta registrar modelo/iOS/Safari, pasos y resultado de una prueba física, incluidos límites encontrados. Tampoco se afirma conformidad completa WCAG a partir de pruebas automáticas.

## Registro físico pendiente

Cuando exista acceso al entorno de prueba desde un iPhone, registrar modelo, versión de iOS/Safari, URL de prueba sin credenciales, fecha y resultado. Usar datos ficticios: entrar, abrir enlace /t/:código, editar con el teclado virtual visible, cambiar Claro/Oscuro/Sistema, desplazar el panel, comentar, cerrar detalle y volver atrás. Comprobar orientación, barra del navegador, ausencia de scroll horizontal y que botones/errores sigan visibles con zoom. Adjuntar capturas sin credenciales ni datos reales y describir cualquier fallo. No marcar el criterio físico como aprobado hasta ejecutar estos pasos en el dispositivo.

## Evidencia automática

Matriz ejecutada con Playwright 1.65.0 y dependencias fijadas por lockfile: [CI del contrato y de la interfaz](https://github.com/danirssx/taski/actions/runs/44790574059) sobre aab27d3, con 13 pruebas de navegador aprobadas, incluidas Chromium y WebKit. El recorrido de apariencia en Chromium también pasó localmente en macOS ARM64. La instalación local de WebKit no había finalizado al ejecutar esa matriz: el resultado WebKit aprobado procede de CI Linux, no de Safari/macOS.

[Captura ficticia del panel móvil en Chromium, 390 × 844, tema oscuro](b7-mobile-dark.png). Se comprobó que el panel mide el viewport completo, conserva Tab dentro del diálogo y ofrece scroll vertical. La captura es evidencia de apariencia emulada, no de hardware iPhone.
