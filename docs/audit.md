# Auditoría y atomicidad D1

El adaptador D1 implementa el puerto de `TicketService`. Cada mutación ejecuta un solo `db.batch`: reserva de reintento, alta/edición del ticket, comentario opcional, evento y recibo confirmado. [D1 documenta batches transaccionales con rollback](https://developers.cloudflare.com/d1/worker-api/d1-database/). No se usa BEGIN/COMMIT manual ni un contador en memoria.

La actividad contiene secuencia, ticket/versión, snapshot del actor declarado (miembro/nombre/canal/cliente), hora del servidor y cambios antes/después. Crear también queda auditado. Los patches guardan el cambio concreto, sin repetir ambos textos; el contenido completo permanece accesible por ticket. Los comentarios guardan el mismo actor/hora y versión de la mutación. Solo son append-only: no se implementa edición/retirada silenciosa.

IDs, hash de petición y reloj se generan en el adaptador de runtime del servidor, no en campos editables del consumidor. La identidad sigue siendo seleccionada, no autenticación individual. El repositorio fija la identidad del proyecto y rechaza usar su base con otro prefijo/ID.

Una prueba fuerza fallo en INSERT de actividad después de preparar cambio/comentario: D1 revierte todos, incluida la reserva de reintento. Otra verifica actor, hora común y un solo evento para estado+avance. Son pruebas de D1 emulado; el despliegue y recuperación del servicio remoto se validan en B11.

Los recibos almacenan key/URL/versión/campos afectados y commentId cuando existe. La [protección de carreras y traducción de conflictos](retries.md) recupera recibos confirmados después de una colisión o pérdida de respuesta. Estas operaciones todavía no se exponen mediante HTTP/MCP.

## Tracks

Cambiar la prioridad o la fecha de un track usa el mismo patrón en un solo `db.batch`: reserva de reintento, alta o edición de `area_plans`, evento en `area_activity` y recibo confirmado. La actividad de tickets exige un ticket, por eso los tracks tienen su propia tabla append-only con área, versión, snapshot del actor, hora del servidor y cambios antes/después. Dos primeras ediciones simultáneas de un track confirman una sola versión; la otra recibe `VERSION_CONFLICT`.

## Horizonte

Crear, editar o quitar un documento de Horizonte sigue el mismo `db.batch`: reserva de reintento, alta o edición en `horizon_docs`, evento en `horizon_activity` y recibo confirmado. Del contenido se registra el número de bloques antes y después, no el texto completo, para que el autoguardado no multiplique el tamaño del historial.
