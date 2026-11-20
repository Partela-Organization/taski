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

En la misma red Wi-Fi, arranca el entorno de prueba con la IP privada de tu Mac. En macOS puedes consultar la IP en Ajustes del Sistema → Wi-Fi → Detalles → TCP/IP. Sustituye la IP de ejemplo por la que aparezca allí.

```sh
npm run qa:device -- 192.168.1.20
```

Abre en el iPhone la dirección que imprime el comando. Usa el código ficticio `browser-fixture-only` y elige Alex. El servidor escucha en esa IP y sirve una compilación de la web con Worker/D1 temporal con tareas y feedback ficticios. Úsalo en una red de confianza y detenlo con Ctrl+C al terminar. Sirve por HTTP local, por lo que **Copiar enlace** muestra el campo seleccionable cuando Safari no ofrece portapapeles. Cada arranque vuelve a cargar los datos de prueba. Para abrir una segunda demo aislada usa un puerto distinto, por ejemplo `npm run qa:device -- 192.168.1.20 5176`.

1. Abre **Todo el equipo**, entra a una tarea y abre su enlace en otra pestaña. Tras recargar debes ver la misma tarea.
2. Cambia el título o la descripción con el teclado abierto. Desplázate hasta **Guardar cambios**, guarda y verifica que el texto siga ahí al recargar.
3. Prueba Claro/Oscuro/Sistema, retrato y horizontal. Comprueba que el panel se desplace verticalmente sin desbordar a los lados y que el teclado, zoom o barra de Safari permitan llegar a guardar y cerrar.
4. En el issue #25, registra modelo, iOS, fecha, pasos que pasaron, fallos y una captura si ayuda. Usa datos ficticios y omite credenciales de las capturas. Si activas VoiceOver, registra también si anuncia los campos, botones y errores en orden.

## Evidencia automática

Matriz ejecutada con Playwright 1.65.0 y dependencias fijadas por lockfile: [CI del contrato y de la interfaz](https://github.com/danirssx/taski/actions/runs/44790574059) sobre aab27d3, con 13 pruebas de navegador aprobadas, incluidas Chromium y WebKit. El recorrido de apariencia en Chromium también pasó localmente en macOS ARM64. La instalación local de WebKit no había finalizado al ejecutar esa matriz: el resultado WebKit aprobado procede de CI Linux, no de Safari/macOS.

[Captura ficticia del panel móvil en Chromium, 390 × 844, tema oscuro](b7-mobile-dark.png). Se comprobó que el panel mide el viewport completo, conserva Tab dentro del diálogo y ofrece scroll vertical. La captura es evidencia de apariencia emulada, no de hardware iPhone.
