# B7-04 · Temas, teclado y responsive

La web conectada ofrece claro, oscuro y sistema; guarda únicamente la preferencia de tema en el navegador. El panel es no modal en escritorio y diálogo completo en móvil, con Escape, retorno de foco y contención de Tab. Resaltado y estados tienen texto, además de color. Los controles móviles principales tienen altura mínima de 44 píxeles CSS.

## Matriz de verificación

| Entorno | Cobertura | Estado |
| --- | --- | --- |
| Chromium, escritorio | Claro/oscuro/sistema, persistencia de tema, Enter/Escape, retorno de foco | Runner automatizado; registrar resultado antes de aceptar. |
| Chromium, 390 × 844 | Diálogo completo, Tab, overflow y controles táctiles | Runner automatizado; registrar resultado antes de aceptar. |
| Playwright WebKit, escritorio y 390 × 844 | Misma suite sobre motor WebKit | Runner automatizado; no equivale a Safari/iPhone físico. |
| Safari en iPhone físico | Teclado virtual, scroll/foco, barra del navegador y toque real | Pendiente. No hay iPhone físico disponible en esta sesión. |
| Lector de pantalla | Orden/nombres y anuncio de errores con VoiceOver | Pendiente de evaluación manual. |

`npm exec playwright install chromium webkit` instala los motores. `npm run test:ui` ejecuta la suite con fixtures ficticios, Worker/D1 efímero y ambos servidores Vite. La prueba de apariencia produce `mobile-dark.png` en el directorio de resultados de cada proyecto; los screenshots no contienen datos reales. CI instala ambos motores y ejecuta la misma configuración. La concurrencia se limita a dos workers para reducir presión sobre el entorno local.

El dispositivo enumerado por las herramientas locales es un iPad sin túnel disponible, no un iPhone utilizable para esta comprobación. No se ha sustituido la prueba física por un viewport emulado. El issue B7-04 permanece abierto hasta registrar modelo/iOS/Safari, pasos y resultado de una prueba física, incluidos límites encontrados. Tampoco se afirma conformidad completa WCAG a partir de pruebas automáticas.
