# WizyDoc — Producto

Última revisión: 3 de octubre de 2026. Describe el producto objetivo; la sección
"Estado" dice qué existe hoy. Detalle de capacidades: `docs/capacidades.md`.

## Qué es
WizyDoc es la agenda de los consultorios médicos en Perú. El médico define sus
horarios y las citas se crean solas: el paciente reserva, confirma, cancela y
reprograma desde un link, y recibe recordatorios automáticos por correo y
WhatsApp, sin que el médico coordine nada. La información de cada paciente se
acumula en una ficha que pertenece al consultorio.

**Tesis:** el médico deja de coordinar citas, y la información de sus pacientes
pasa a ser un activo suyo.

## Para quién
- **Foco:** médico independiente, de cualquier especialidad.
- **Después:** consultorios con varios médicos y clínicas con sedes.
- **Paciente:** no tiene cuenta; reserva desde un link, casi siempre en el celular.
- **Competidores directos:** Doctocliq y AgendaPro.

## Problema
Las citas se coordinan por teléfono y WhatsApp personal: el médico o su
asistente pierde horas, las inasistencias dejan huecos en la agenda y los datos
del paciente quedan dispersos.

## Prioridades
**Primero: que el médico no coordine nada**
- El paciente cancela, reprograma y confirma desde un link.
- Recordatorio automático 24 horas antes, con confirmación de un toque, por
  correo y WhatsApp (ver Comunicación).
- Política de cancelación (ver abajo).
- Estados de cita y agenda semanal.

**Después: que la información del paciente se acumule**
- Motivo de consulta en la reserva, que llega a la ficha.
- Importar pacientes desde Excel.
- Visión: evidencia de cada consulta.

**No por ahora:** marketplace (choca con que los datos son del consultorio),
teleconsulta, cobros a pacientes, facturación SUNAT, diagnósticos codificados,
recetas, lista de espera automática, SMS, compra de mensajes de WhatsApp y notas
de consulta (ver `docs/ficha-paciente-historial.md`).

## Comunicación con el paciente
- **Canales:** correo y WhatsApp, siempre automáticos. Mensajes por WhatsApp sí;
  chat manual no: lo que se elimina es que el médico conteste, no el canal. Sin
  SMS (cuesta por mensaje y en Perú se lee poco).
- **Número:** el WhatsApp sale de un número de WizyDoc, no del médico. El
  mensaje dice que ese número no recibe respuestas y que se usen los botones
  para confirmar, cancelar o reprogramar.
- **Cupo:** los planes de pago incluyen recordatorios por WhatsApp cada mes. No
  se venden paquetes adicionales. Al agotarse el cupo, el recordatorio sigue por
  correo.

## Política de cancelación
- **Cancelar:** siempre, desde el link, hasta que empiece la cita. Si faltan
  menos de 12 horas queda registrada como **cancelación tardía**. Bloquearla no
  hace que el paciente asista: convierte un aviso en una inasistencia y lo
  empuja a escribirle al médico.
- **Reprogramar:** desde el link sólo hasta 12 horas antes. Pasado ese plazo,
  el paciente puede cancelar y reservar otro horario.
- **Confirmar:** hasta que empiece la cita.
- El personal del consultorio puede cancelar o mover cualquier cita desde el
  panel.
- Una sola regla para todos; no es configurable por ahora. El plazo lo valida el
  servidor.

## Estados de cita
Pendiente → confirmada (por el paciente) → **atendida** o **no asistió**; o
cancelada (por el paciente o el consultorio; tardía si faltaban menos de 12 h).

**Atendida por defecto:** al terminar la hora de la cita pasa sola a atendida.
El médico sólo marca "no asistió" cuando el paciente no vino. Así el médico no
hace trabajo administrativo en cada cita, el historial de la ficha refleja la
realidad y se puede medir si los recordatorios bajan las inasistencias.

## Planes (objetivo; el código aún no los refleja)
| Plan | Precio | Médicos | Sedes | Pacientes | WhatsApp incluido al mes |
| --- | --- | --- | --- | --- | --- |
| Gratis | S/ 0 | 1 | 1 | Hasta 10 | 0 |
| Consultorio | S/ 79 al mes (S/ 790 al año) | 3 (adicional S/ 25) | 1 | Ilimitados | 50 |
| Clínica | S/ 199 al mes (S/ 1,990 al año) | 8 (adicional S/ 20) | 3 (adicional S/ 40) | Ilimitados | 250 |
| Red | A medida | A medida | A medida | Ilimitados | A medida |

- **Todos los planes incluyen:** reserva online, agenda, autogestión del paciente
  por link, recordatorio por correo, ficha del paciente (en Gratis, hasta el
  tope), importar desde Excel y exportar CSV.
- **Métricas por sede:** desde Clínica. **Soporte prioritario:** Red.
- **Tope de pacientes en Gratis:** al llegar a 10 no se pueden crear pacientes
  nuevos hasta pasar a un plan de pago.
  - **Sólo frena a los pacientes nuevos.** Los que ya tienen ficha siguen
    reservando por el link con normalidad: se frena el crecimiento, no la
    consulta que ya existe.
  - **Al paciente nuevo, un mensaje y no un error:** "Este consultorio no está
    recibiendo pacientes nuevos en línea por ahora", con el contacto del
    consultorio. Es la única excepción aceptada a "el médico no coordina nada",
    y la decide el médico al no pasar a un plan de pago.
  - **El médico ve lo que pierde:** se le avisa de cada paciente nuevo que no
    pudo reservar ("3 pacientes nuevos intentaron reservar esta semana"), con la
    mejora de plan. Ese aviso es lo que empuja a pagar, no el bloqueo.
  - **Las fichas existentes siempre se pueden leer y exportar:** los datos de
    salud de un paciente nunca quedan retenidos para forzar el pago.
  - **Al 80 %** se avisa al médico.
  - **Siguiente paso (post pay):** al 80 % se ofrece agregar tarjeta; si la
    agrega, al llegar al tope pasa solo a Consultorio sin ningún corte. Requiere
    guardar tarjeta en Gratis con Culqi, así que se lanza primero el bloqueo.

## Principios
- **El médico no coordina nada.** Si un flujo termina en "comunícate con el
  consultorio", está incompleto.
- **Simple antes que completo.** Si una pantalla necesita explicación, está mal
  diseñada.
- **Ganar por simplicidad, no por cantidad de módulos.** Los competidores
  directos ofrecen caja, inventario y CRM; WizyDoc no los persigue.
- **El booking público es mobile-first** y se completa en menos de un minuto.
- **La privacidad del paciente es innegociable.** Los datos son del consultorio,
  no de WizyDoc ni de un directorio. El consultorio es responsable del banco de
  datos y el paciente conserva sus derechos (Ley 29733); validar la redacción
  con un abogado.
- **El plan se nota, no bloquea en seco:** una función fuera del plan muestra la
  mejora de plan (402), no un error. Nunca se bloquea el acceso a datos ya
  guardados.
- Español de Perú, soles, huso `America/Lima`.

## Preguntas abiertas
- **Respuestas del paciente por WhatsApp.** Si responde un recordatorio ("¿puedo
  llegar 15 minutos tarde?"), el número de WizyDoc no recibe respuestas y el
  mensaje se pierde. ¿Se acepta como costo de la tesis o se guía al paciente a
  otro canal?
- **¿Quién usa el panel?** El médico independiente muchas veces no tiene
  asistente: el usuario sería él, desde el celular entre consultas. Si es así,
  el panel también debe ser mobile-first.
- **Plan para un solo médico.** El foco es el médico independiente, pero el
  primer plan de pago está pensado para 3. ¿Conviene un plan de 1 médico
  (alrededor de S/ 49) frente a Doctocliq Individual (≈ S/ 65)?
- **Precios frente a la competencia:** tipo de cambio usado y si el precio de
  AgendaPro es plano o por profesional. Pendiente de discutir.

## Riesgos conocidos
- **WhatsApp** es el canal que el paciente usa en Perú y todos los competidores
  directos lo ofrecen. Mientras no esté construido, WizyDoc está en desventaja y
  los recordatorios dependen del correo.
- **Foco en médico independiente vs. código pensado para clínicas**
  (organizaciones, sedes, roles): el onboarding del médico solo debe esconder esa
  complejidad.
- **El tope de 10 pacientes** es una hipótesis por validar con médicos reales.
- **El sitio publicado** (wizydoc.app) muestra planes anteriores, distintos a
  estos.

## Estado
Beta. Mercado inicial: Perú.

- **Existe** (según el código revisado el 3 de octubre de 2026): reserva
  pública, agenda del día por médico, disponibilidad semanal, ficha del paciente
  con historial de citas, métricas por sede, invitaciones y suscripciones con
  Culqi.
- **Cobro con Culqi congelado durante la beta.** Sólo crea la suscripción al
  registrarse; no hay renovación, pagos fallidos ni cancelación. El onboarding
  sólo ofrece Gratis y los planes de pago se asignan a mano. No es prioridad
  hasta que exista lo que justifica pagar (autogestión, recordatorios, WhatsApp).
- **No existe todavía:** autogestión por link, política de cancelación,
  estados de cita (toda cita queda pendiente), agenda semanal, recordatorios
  (hoy solo el correo de confirmación al reservar), WhatsApp, tope de pacientes,
  importación desde Excel y exportación CSV.
