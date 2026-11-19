# Lista conectada B7-01

Implementación en revisión: lista y captura conectadas al cliente HTTP, con sesión por cookie. El PR permanece en borrador mientras B6-04 siga pendiente. No se presenta como una entrega integrada de B7.

## Arranque local

Configura `.dev.vars` siguiendo [acceso](access.md), aplica `npm run db:migrate` y arranca `npm run dev` en un terminal. En otro ejecuta `npm run app` y abre `http://127.0.0.1:5174`. Selecciona persona e introduce el código de tu instalación. Solo la cookie HttpOnly conserva la sesión; el código no se guarda en localStorage ni en el bundle.

El servidor Vite local reenvía `/api` al Worker de 8787. Reescribe únicamente el Origin exacto de su interfaz local; conserva otros orígenes para que el Worker los rechace. Es una composición de desarrollo: no configura CORS público ni despliega assets. El Worker sigue sirviendo API/MCP y salud; `dist/app` contiene el nuevo bundle y `dist/web` conserva el preview de componentes.

## Uso y límites

Todo el equipo, Mis tickets y Por revisar consultan la API en páginas de 20 tareas, con filtro por área. Cargar más consume el cursor del servidor; cambiar filtros descarta páginas anteriores. La búsqueda por código/título se limita a las páginas cargadas y se anuncia así. Actualizar lista consulta de nuevo el servidor; todavía no hay actualización automática.

Escribe un título y pulsa Enter para crear. La lista se actualiza y se abre el detalle recuperado del servidor después del recibo de creación. El detalle inicial es de lectura, con descripción completa y cinco comentarios recientes; la edición y navegación ampliada corresponden a B7-02. No se representa una escritura como guardada antes de confirmar la respuesta.

Ante una respuesta perdida, se conserva texto y solicitud, bloqueando la modificación del título hasta reintentar con la misma clave de idempotencia. Una sesión vencida vuelve al acceso. Salir revoca la cookie en servidor. Los datos compartidos proceden de la API, sin base de tickets en localStorage. La selección de persona sigue siendo identidad declarada, según B4.

## Comprobaciones

`npm run check` comprueba cliente, tipos y bundles de preview y aplicación. `npm run test:ui` incluye pruebas de filtros y recuperación de una respuesta de creación perdida usando respuestas HTTP controladas en navegador; esas pruebas no afirman integración completa navegador/Worker. Las pruebas HTTP/D1 del núcleo verifican por separado persistencia e idempotencia. El recorrido manual descrito permite probar ambos servidores locales juntos; no se ha validado despliegue remoto.
