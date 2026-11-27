# Persistencia e identificadores de B3

La migración `0002_tickets.sql` crea tickets, comentarios, actividad y recibos idempotentes, además de la identidad de la instalación. No incluye datos reales ni crea tickets por defecto. Aplicar con `npm run db:migrate`; el esquema de bootstrap de B1 sigue vigente.

`tickets.number` es un INTEGER PRIMARY KEY AUTOINCREMENT, asignado por SQLite/D1. El código generado combina el prefijo fijado para la instalación y ese número; nunca usa COUNT(*) ni un contador en memoria. `id` es otro identificador estable generado por la aplicación. La URL almacena su base original y código: renombrar, reasignar o convertir feedback no los cambia. Las transacciones fallidas no publican un código confirmado.

La migración `0008_ticket_deletion.sql` añade `tickets.deleted_at`. La operación de borrado marca esa fecha, avanza la versión y añade el evento y el recibo en un mismo batch. Las lecturas de tickets omiten filas eliminadas, incluidos accesos por ID o alias. Las filas y sus códigos se conservan para que la actividad siga siendo consultable.

La migración `0009_area_plans.sql` crea `area_plans` y `area_activity`. `area_plans` guarda por área configurada la prioridad (1–3), la fecha límite opcional, la versión y la última persona o agente que la cambió. No guarda rótulos: siguen en la configuración. Un área sin fila equivale a prioridad 2, sin fecha y versión 0. Los triggers exigen versión 1 al insertar y versión+1 al actualizar, e impiden borrar planes.

La migración `0010_horizon.sql` crea `horizon_docs` y `horizon_activity` para [Horizonte](horizonte.md). Cada documento guarda su título, estado, track opcional y bloques en un array JSON, con versión y borrado lógico. Los triggers exigen versión 1 al crear y versión+1 al editar, impiden borrar filas y hacen la actividad solo de alta.

La instalación vincula project.id/prefix al primer uso. Reutilizar la base con otro ID/prefijo produce conflicto, sin reescribir tickets. Un proyecto distinto usa otra base. Los rótulos y nombres siguen en configuración; los registros guardan IDs de referencia y snapshots de actor para mantener la atribución histórica.

Los índices cubren estado/fecha, responsable/estado, tipo, área, comentarios por versión y actividad por secuencia. Comentarios y actividad son append-only; no se habilitan edición/retirada en esta versión. Cada versión de ticket tiene un único evento. `mutation_receipts` reserva claves por actor/operación y conserva el resultado confirmado para reintentos. Sus garantías se implementan y prueban en los siguientes issues B3-02–04.

El guard de UPDATE exige version+1 y conserva identidad/código/URL/creador/fecha inicial. No constituye por sí solo una auditoría de escrituras administrativas externas: las mutaciones de aplicación se agrupan con comentarios y eventos en un batch D1 atómico. La API no expone acceso SQL.

Pruebas de esquema: creación concurrente con datos ficticios, códigos únicos, identidad conservada y rechazo de prefijos/borrado inválidos. Se ejecutan con D1 emulado mediante `npm test`, sin base remota.

## Rotación administrativa de prefijo

La migración `0004_ticket_key_aliases.sql` permite conservar las referencias al cambiar el prefijo de una instalación existente. Por ejemplo, si un administrador cambia `DEMO` a `STUDIO`, los enlaces antiguos como `/t/DEMO-001` abren el mismo ticket y la web pasa a `/t/STUDIO-001`. La API y MCP resuelven ambas claves. Los recibos de operaciones ya confirmadas se conservan, incluida su referencia original.

Aplica primero la migración y el Worker que consulta los aliases. Comprueba la identidad de la base antes de rotar. En una sola transacción D1 registra las claves antiguas en `ticket_key_aliases`, retira temporalmente `tickets_update_guard`, cambia el prefijo de los tickets y de `project_identity`, y restaura el mismo guard. Después publica el prefijo nuevo en la configuración, con `configVersion` incrementada. Durante el cambio, el guard de identidad puede devolver 409 hasta que coincidan base y configuración. Verifica lectura desde ambas claves, numeración, historial y creación bajo el prefijo nuevo.
