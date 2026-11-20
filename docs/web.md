# Lista conectada B7-01

B7-01 está integrado: lista y captura conectadas al cliente HTTP, con sesión por cookie. B6-04 conserva por separado su benchmark pendiente; la web no afirma ventajas comparativas. B7-02 incorpora panel editable y navegación por enlaces.

## Arranque local

Configura `.dev.vars` siguiendo [acceso](access.md), aplica `npm run db:migrate` y arranca `npm run dev` en un terminal. En otro ejecuta `npm run app` y abre `http://127.0.0.1:5174`. Selecciona persona e introduce el código de tu instalación. Solo la cookie HttpOnly conserva la sesión; el código no se guarda en localStorage ni en el bundle.

El servidor Vite local reenvía `/api` al Worker de 8787. Reescribe únicamente el Origin exacto de su interfaz local; conserva otros orígenes para que el Worker los rechace. Es una composición de desarrollo: no configura CORS público ni despliega assets. El Worker sigue sirviendo API/MCP y salud; `dist/app` contiene el nuevo bundle y `dist/web` conserva el preview de componentes.

## Uso y límites

Todo el equipo, Mis tickets y Por revisar consultan la API en páginas de 20 tareas, con filtro por área. Cargar más consume el cursor del servidor; cambiar filtros descarta páginas anteriores. La búsqueda por código/título se limita a las páginas cargadas y se anuncia así. Actualizar lista consulta de nuevo el servidor; todavía no hay actualización automática.

Escribe un título y pulsa Enter para crear. La lista se actualiza y se abre el detalle recuperado del servidor después del recibo de creación. El panel permite editar los campos principales, con descripción completa y cinco comentarios recientes. No se representa una escritura como guardada antes de confirmar la respuesta.

Ante una respuesta perdida, se conserva texto y solicitud, bloqueando la modificación del título hasta reintentar con la misma clave de idempotencia. Un error HTTP explícito de validación permite corregir el texto. Una sesión vencida vuelve al acceso. Salir revoca la cookie en servidor. Los datos compartidos proceden de la API, sin base de tickets en localStorage. La selección de persona sigue siendo identidad declarada, según B4.

## Comprobaciones

`npm run check` comprueba cliente, tipos y bundles de preview y aplicación. `npm run test:ui` incluye pruebas de filtros y recuperación de una respuesta de creación perdida usando respuestas HTTP controladas en navegador; además ejecuta un recorrido real navegador → proxy Vite → Worker/D1 efímero con 24 tareas ficticias. Verifica código incorrecto/correcto, cookie HttpOnly, paginación, filtros, recarga, revocación de sesión y una respuesta perdida después de confirmar una creación en D1: el reintento y la lectura paginada posterior confirman una sola tarea. No se ha validado despliegue remoto.

Playwright inicia el [servidor de fixtures](../scripts/serve-browser-fixture.mjs) en 8787 y ambos Vite; esos puertos deben estar libres. El harness usa almacenamiento temporal y exige el preset demo; no abre la D1 de desarrollo ni modifica `.dev.vars`. Al terminar se cierran los servidores.

## Panel y enlaces B7-02

El enlace `/t/DEMO-003` es un ejemplo ficticio: abre el detalle después de entrar y funciona al recargar con Vite. Copiar enlace usa el origen de la web. Abrir otra tarea y Atrás recupera el borrador de cada tarea; Escape cierra y vuelve a la lista. Los borradores viven solo en memoria de la pestaña, se eliminan al salir y la recarga avisa si quedan cambios. Confirmar salir de la página descarta esos borradores.

Título, descripción, responsable, estado y área se guardan con la versión consultada; solo se envían los campos editados. Los errores conservan el texto y los reintentos inciertos mantienen la misma solicitud. Un conflicto exige consultar la versión actual y revisar antes de volver a guardar; los campos que no editaste reciben los cambios del servidor. Actualizar detalle pide confirmación antes de descartar un borrador. En escritorio el panel permite seguir usando la lista; en móvil conserva el diálogo completo con Escape y control del foco.

## Conversación y auditoría B7-03

El panel permite comentar y consultar comentarios anteriores de cinco en cinco. La actividad se pagina de diez en diez e identifica persona/agente, canal, fecha y valores antes/después. Actualizar actividad vuelve a consultar el historial; no hay push. Resaltar/quitar resaltado guarda un cambio auditado y no altera el estado de la tarea. La lista muestra también una etiqueta textual y subrayado, sin depender solo del color.

Los comentarios no enviados se conservan al cambiar de tarea dentro de la pestaña y se avisa al salir de la página. Los reintentos inciertos conservan la solicitud. Si otra persona cambió la versión, se consulta la actual sin enviar automáticamente el comentario: el texto permanece para revisar y reenviar. Las ediciones pendientes conservan por separado sus campos y versiones.
