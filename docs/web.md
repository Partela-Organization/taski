# Lista conectada B7-01

B7-01 está integrado: lista y captura conectadas al cliente HTTP, con sesión por cookie. B6-04 conserva por separado su benchmark pendiente; la web no afirma ventajas comparativas. B7-02 incorpora panel editable y navegación por enlaces.

## Arranque local

Configura `.dev.vars` siguiendo [acceso](access.md), aplica `npm run db:migrate` y arranca `npm run dev` en un terminal. En otro ejecuta `npm run app` y abre `http://127.0.0.1:5174`. Selecciona persona e introduce el código de tu instalación. Solo la cookie HttpOnly conserva la sesión; el código no se guarda en localStorage ni en el bundle.

El servidor Vite local reenvía `/api` al Worker de 8787. Reescribe únicamente el Origin exacto de su interfaz local; conserva otros orígenes para que el Worker los rechace. Es una composición de desarrollo: no configura CORS público ni despliega assets. El Worker sigue sirviendo API/MCP y salud; `dist/app` contiene el nuevo bundle y `dist/web` conserva el preview de componentes.

## Espacio de trabajo

La app conectada sigue la [dirección visual v3](design-direction.md). La navegación usa una barra lateral en escritorio y pestañas en móvil. La búsqueda y el filtro comparten una barra y la captura de tareas se hace en una línea. Por defecto, las áreas de la instalación aparecen como secciones con su cantidad de entradas cargadas y cada fila muestra su estado. **Agrupar por** permite cambiar a secciones por estado. **Terminado** empieza plegado en ambas vistas. El detalle abre a la derecha en escritorio y ocupa la pantalla en móvil.

Usa **Lista** o **Tarjetas** en la barra del espacio de trabajo. Por ejemplo, filtra por Web y elige **Por estado** para revisar esa área por etapa. Las tarjetas muestran dos columnas cuando hay espacio y una en móvil o con el panel abierto en un espacio estrecho. Puedes abrir un ticket desde toda su fila o tarjeta. El enlace al PR sigue abriendo el PR. La presentación y el agrupamiento se guardan en el navegador y cambiar cualquiera conserva la búsqueda, el filtro y el detalle abierto.

## Uso y límites

Las vistas consultan la API en páginas de 20 entradas y muestran las más recientes primero dentro de cada grupo. La fecha es la de creación. **Cargar más** permanece disponible al pie mientras el servidor tenga otra página. Cada área o estado muestra hasta diez entradas al inicio. **Ver más** amplía ese grupo entre los tickets ya cargados. Por ejemplo, filtra por Web, pulsa **Cargar más** para traer otra página y luego **Ver más de Web** para desplegarla. Cambiar filtros descarta páginas anteriores. La búsqueda por código o título se limita a las páginas cargadas y muestra todas sus coincidencias. **Actualizar lista** vuelve a consultar el servidor.

Escribe un título y pulsa **Añadir** o Enter para crear. La lista se actualiza y se abre el detalle recuperado del servidor después del recibo de creación. El panel permite editar los campos principales, con descripción completa y cinco comentarios recientes. No se representa una escritura como guardada antes de confirmar la respuesta.

Ante una respuesta perdida, se conserva texto y solicitud, bloqueando la modificación del título hasta reintentar con la misma clave de idempotencia. Un error HTTP explícito de validación permite corregir el texto. Una sesión vencida vuelve al acceso. Salir revoca la cookie en servidor. Los datos compartidos proceden de la API, sin base de tickets en localStorage. La selección de persona sigue siendo identidad declarada, según B4.

## Comprobaciones

`npm run check` comprueba cliente, tipos y bundles de preview y aplicación. `npm run test:ui` incluye pruebas de filtros y recuperación de una respuesta de creación perdida usando respuestas HTTP controladas en navegador; además ejecuta un recorrido real navegador → proxy Vite → Worker/D1 efímero con 24 tareas ficticias. Verifica código incorrecto/correcto, cookie HttpOnly, paginación, filtros, recarga, revocación de sesión y una respuesta perdida después de confirmar una creación en D1: el reintento y la lectura paginada posterior confirman una sola tarea. La [guía de Cloudflare](deployment/cloudflare.md) registra el ensayo remoto.

Playwright inicia el [servidor de fixtures](../scripts/serve-browser-fixture.mjs) en 8787 y ambos Vite; esos puertos deben estar libres. El harness usa almacenamiento temporal y exige el preset demo; no abre la D1 de desarrollo ni modifica `.dev.vars`. Al terminar se cierran los servidores.

## Conectar MCP desde el encabezado

Entra a Taski y pulsa **Conectar MCP** debajo de la navegación. La guía muestra el endpoint de la instalación y el ID del miembro que seleccionaste. Elige **Codex** o **Claude Code** y copia la configuración al archivo indicado.

Carga el código compartido en `TASKI_CODE` en la terminal que abre el cliente. La guía incluye un comando para Bash o Zsh que lee el código sin mostrarlo. Las configuraciones usan la referencia a esa variable. Para comprobar, pide al cliente que ejecute `get_project` y te diga el nombre del proyecto. Después puedes pedirle que liste tus tickets pendientes.

Consulta los recorridos y el diagnóstico de [Codex](mcp/codex.md) y [Claude Code](mcp/claude-code.md).

## Panel y enlaces B7-02

El enlace `/t/DEMO-003` es un ejemplo ficticio: abre el detalle después de entrar y funciona al recargar con Vite. Copiar enlace usa el origen de la web. Abrir otra tarea y Atrás recupera el borrador de cada tarea; Escape cierra y vuelve a la lista. Los borradores viven solo en memoria de la pestaña, se eliminan al salir y la recarga avisa si quedan cambios. Confirmar salir de la página descarta esos borradores.

Para quitar una tarea o feedback, abre su detalle y pulsa **Eliminar** junto a **Copiar enlace**. Confirma tras revisar el título. La lista se actualiza y el enlace, los comentarios y los adjuntos dejan de estar disponibles en el detalle. Taski conserva el registro de auditoría.

Título, descripción, responsable, estado y área se guardan con la versión consultada; solo se envían los campos editados. Los errores conservan el texto y los reintentos inciertos mantienen la misma solicitud. Un conflicto exige consultar la versión actual y revisar antes de volver a guardar; los campos que no editaste reciben los cambios del servidor. Actualizar detalle pide confirmación antes de descartar un borrador. En escritorio el panel permite seguir usando la lista; en móvil conserva el diálogo completo con Escape y control del foco.

## Conversación y auditoría B7-03

El panel permite comentar y consultar comentarios anteriores de cinco en cinco. La actividad se pagina de diez en diez e identifica persona/agente, canal, fecha y valores antes/después. Actualizar actividad vuelve a consultar el historial; no hay push. Resaltar/quitar resaltado guarda un cambio auditado y no altera el estado de la tarea. La lista muestra subrayado e icono de resaltado con etiqueta accesible.

Los comentarios no enviados se conservan al cambiar de tarea dentro de la pestaña y se avisa al salir de la página. Los reintentos inciertos conservan la solicitud. Si otra persona cambió la versión, se consulta la actual sin enviar automáticamente el comentario: el texto permanece para revisar y reenviar. Las ediciones pendientes conservan por separado sus campos y versiones.

Mientras se confirma un comentario o un resaltado, el panel pausa **Guardar cambios** y **Convertir en tarea**. Por ejemplo, después de comentar un feedback, puedes convertirlo en cuanto se habilite el botón.

## Temas y dispositivos B7-04

El selector Tema ofrece Claro/Oscuro/Sistema y conserva la elección. La [matriz de verificación](verification/b7-accessibility.md) distingue motores automatizados de Safari/iPhone físico confirmado por el equipo. Los controles móviles principales tienen altura mínima de 44 píxeles; panel, foco, etiquetas y mensajes no dependen solo del color.


## Compartir feedback B8-01

En móvil se abre Feedback al entrar. También es la vista inicial de quienes tienen esa preferencia en la configuración, incluso desde escritorio. Las demás vistas siguen disponibles para todo el equipo.

1. En **Feedback**, pulsa **Nuevo feedback** en el teléfono para abrir el editor. Escribe una frase en **¿Qué quieres compartir?**, usa **Añadir detalles** si necesitas contexto y pulsa **Enviar feedback**. El aporte se guarda en el área predeterminada del proyecto y se abre su detalle. En escritorio el editor está a la vista.
2. Usa **Copiar enlace** para enviárselo a otra persona del equipo. La conversación está debajo del aporte. Para responder, escribe en **Comentario** y pulsa **Enviar comentario**.
3. Abre **Gestionar feedback** para cambiar el área, resaltar, revisar actividad o **Convertir en tarea**. La conversión conserva el área guardada, el enlace, el autor, la conversación y el historial.

Cada aporte tiene una casilla **Hecho**. Márcala cuando el feedback esté atendido y desmárcala para reabrirlo. El cambio guarda el estado Terminado o Pendiente con la versión consultada y queda en la actividad con la persona que lo hizo. La casilla cambia solo cuando el servidor confirma. Si la respuesta se pierde, vuelve a pulsarla: el reintento usa la misma solicitud. Los agentes no pueden marcar feedback como hecho, igual que con las tareas.

Usa **Abiertos**, **Hechos** o **Todos** encima de la lista. Abiertos es la opción inicial y la elección se guarda en el navegador. Por ejemplo, marca un aporte en Abiertos, pasa a Hechos para verlo tachado y desmárcalo allí si necesitas reabrirlo.

La lista de Feedback muestra los aportes más recientes primero. **Ver más** amplía la lista y **Cargar más** trae la siguiente página cuando está disponible. Los filtros, grupos y tarjetas se usan desde las vistas de trabajo.

En móvil, toca tu nombre en el encabezado para cambiar el tema o salir. **Conectar MCP** queda debajo de las pestañas. Si cierras el editor de Feedback, el borrador permanece mientras sigas en la misma sesión y pestaña.

La interfaz usa el tipo y el autor que devuelve la API. Feedback y tareas comparten los mismos permisos. La prueba de navegador cubre captura móvil, apertura desde otra sesión, comentario y conversión con Worker/D1 efímero.

[Captura móvil con datos ficticios](verification/b8-feedback-mobile.png) y [detalle en escritorio](verification/b8-feedback-desktop.png).

Para pruebas en dispositivos y con participantes, arranca la [demo temporal en la red local](verification/b7-accessibility.md#repetir-en-un-iphone-físico) y sigue el [recorrido de feedback](verification/b8-feedback.md).

Al crear Feedback puedes pulsar **Adjuntar imagen** o **Grabar audio**. Detén la grabación para escucharla antes de enviar y usa **Quitar** si deseas descartarla. Si la subida falla después de crear el feedback, reintenta desde el mismo formulario.

## Adjuntar imágenes

Con el [almacenamiento de adjuntos](attachments.md) habilitado, abre un feedback o una tarea guardados y pulsa **Adjuntar imagen**. Selecciona un JPEG, PNG o WebP de hasta 5 MiB y pulsa **Subir imagen**. Desde el detalle puedes abrir el original o retirar las imágenes que subiste.

## Enlace manual a un PR B9-01

Pega un enlace HTTPS en **Enlace al PR** y pulsa **Guardar cambios**. Puedes cambiar de estado en la misma edición. La fila y el detalle muestran el enlace confirmado. Para sustituirlo, edita el campo. Para retirarlo, déjalo vacío y guarda. La actividad muestra el valor anterior, el nuevo y el autor.

Taski almacena una referencia manual. El estado de la tarea se edita desde Taski y los checks y el merge se consultan desde el enlace en GitHub.
