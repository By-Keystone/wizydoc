# WizyDoc — Producto

Última revisión: 28 de octubre de 2026. Describe el producto objetivo; la sección
"Estado" dice qué existe hoy. Detalle de capacidades: `docs/capacidades.md`.

## Qué es
WizyDoc es la agenda de los consultorios médicos en Perú. El médico define sus
horarios y las citas se crean solas: el paciente reserva, cancela y reprograma
desde un link, y recibe recordatorios automáticos por correo y WhatsApp, sin que
el médico coordine nada. La información de cada paciente se acumula en una
ficha que pertenece al consultorio.

**Tesis:** el médico deja de coordinar citas, y la información de sus pacientes
pasa a ser un activo suyo.

## Para quién
- **Foco:** médico independiente, de cualquier especialidad. Suele ser a la vez
  el dueño de la cuenta (administrador) y el médico que atiende.
- **Después:** consultorios con varios médicos y clínicas con sedes.
- **Paciente:** no tiene cuenta; reserva desde un link, casi siempre en el celular.
- **Competidores directos:** Doctocliq y AgendaPro.

## Problema
Las citas se coordinan por teléfono y WhatsApp personal: el médico o su
asistente pierde horas, las inasistencias dejan huecos en la agenda y los datos
del paciente quedan dispersos.

## Prioridades
**Ahora**
- **Límites por citas:** hecho. Ningún plan limita médicos y cada plan tiene su
  tope de citas al mes (ver Planes y Estado; detalle en
  `docs/features/tope-citas-mes/prd.md`).
- **"Mi día":** la agenda del día del médico, centrada en su siguiente cita, con
  un resumen de la ficha del paciente en los planes de pago (mockup en
  `docs/features/agenda-dia-medico/mockup.html`).
- Estados de cita y agenda semanal.

**Después: que la información del paciente se acumule**
- Motivo de consulta en la reserva, que llega a la ficha.
- Importar pacientes desde Excel.
- Visión: evidencia de cada consulta.

**Sólo si los clientes lo piden:** recordatorio automático 24 horas antes y
confirmación de asistencia del paciente (ver Comunicación). Se sacaron de las
prioridades el 17 de octubre de 2026.

**No por ahora:** marketplace (choca con que los datos son del consultorio),
teleconsulta, cobros a pacientes, facturación SUNAT, diagnósticos codificados,
recetas, lista de espera automática, SMS, compra de mensajes de WhatsApp y notas
de consulta (ver `docs/ficha-paciente-historial.md`).

## Comunicación con el paciente
Hoy el paciente recibe correos al reservar, cancelar y reprogramar, todos con el
botón "Gestionar mi cita". Cuando existan los recordatorios:
- **Canales:** correo y WhatsApp, siempre automáticos. Mensajes por WhatsApp sí;
  chat manual no: lo que se elimina es que el médico conteste, no el canal. Sin
  SMS (cuesta por mensaje y en Perú se lee poco).
- **Número:** el WhatsApp sale de un número de WizyDoc, no del médico. El
  mensaje dice que ese número no recibe respuestas y que se usen los botones
  para cancelar o reprogramar.
- **Cupo:** los planes de pago incluyen recordatorios por WhatsApp cada mes. No
  se venden paquetes adicionales. Al agotarse el cupo, el recordatorio sigue por
  correo.

## Política de cancelación
Detalle y razones: `docs/features/autogestion-paciente/prd.html`.
- **Cancelar y reprogramar desde el link:** hasta 12 horas antes de la cita. A
  menos de 12 horas no se puede cambiar nada desde el link. No existe la
  cancelación tardía: desde el link no se puede cancelar tarde.
- **Motivo al cancelar:** obligatorio, de una lista fija, sin texto libre. Llega
  al médico en su aviso por correo.
- **Reprogramar:** una sola vez por cita, sólo dentro de la disponibilidad del
  médico y a horarios que queden a 12 horas o más. Se mantiene el médico; sólo si
  no tiene ningún horario se ofrece otro médico de la misma sede y especialidad.
- **Sólo en planes de pago.** En Gratis el correo sale sin el link.
- El personal del consultorio podrá cancelar o mover cualquier cita desde el
  panel (aún no existe).
- Una sola regla para todos; no es configurable por ahora. El plazo lo valida el
  servidor.

## Estados de cita
Pendiente → **atendida** o **no asistió**; o cancelada (por el paciente o el
consultorio). Si algún día vuelve la confirmación del paciente, se agrega
"confirmada" entre pendiente y atendida.

**Atendida por defecto:** al terminar la hora de la cita pasa sola a atendida.
El médico sólo marca "no asistió" cuando el paciente no vino. Así el médico no
hace trabajo administrativo en cada cita y el historial de la ficha refleja la
realidad.

## Planes (objetivo; el código ya aplica las citas al mes y las sedes)
| Plan | Precio | Citas al mes | Sedes | WhatsApp incluido al mes |
| --- | --- | --- | --- | --- |
| Gratis | S/ 0 | 10 | 1 | 0 |
| Consultorio | S/ 79 al mes (S/ 790 al año) | 150 | 1 | 50 |
| Clínica | S/ 199 al mes (S/ 1,990 al año) | 600 | 3 (adicional S/ 40) | 250 |
| Red | A medida | A medida (hoy sin tope) | A medida | A medida |

- **Sin límite de médicos ni de pacientes en ningún plan.** Lo que limita cada
  plan son las citas al mes y las sedes. Decidido el 18 de octubre de 2026:
  el límite sigue al trabajo del consultorio, no al tamaño de su equipo.
- **Todos los planes incluyen:** reserva online, agenda (también "Mi día") y los
  datos básicos del paciente, que se pueden ver y editar: nombre, apellido,
  documento, teléfono, correo, sexo, fecha de nacimiento (edad), contacto de
  emergencia y aseguradora.
- **Desde Consultorio:** autogestión del paciente por link, el resto de la ficha
  (datos de salud e historial de citas; en "Mi día", también en el resumen),
  importar desde Excel y exportar CSV.
- **Métricas por sede:** desde Clínica. **Soporte prioritario:** Red.
- **Al bajar a Gratis se pierde todo lo del plan anterior, de inmediato y sin
  excepciones:** los datos de salud y el historial dejan de verse (tampoco en
  solo lectura), no hay importación ni exportación y los links de autogestión
  ya enviados dejan de funcionar. Vale para todas las funciones de pago, las de
  hoy y las futuras.
- **Tope de citas al mes:** cada plan tiene el suyo (Gratis 10, Consultorio 150,
  Clínica 600; Red, a medida). Se aplica también durante la beta. Al llegar al
  tope, el link de todas las sedes de la cuenta deja de aceptar reservas hasta
  el día 1 o hasta pasar a un plan mayor. Detalle y razones:
  `docs/features/tope-citas-mes/prd.md`.
  - **Qué cuenta como cita del mes:** cada cita que un paciente reserva en el
    booking, en el mes calendario de Lima en que la reserva, sea para la fecha
    que sea. Una vez contada no se descuenta: tampoco si se cancela (por el
    paciente o el consultorio) o queda en "no asistió". Reprogramar no la cuenta
    otra vez. El tope es de la cuenta: suma todas sus sedes y médicos.
  - **Las citas ya reservadas no se tocan:** se frena la reserva nueva, no la
    consulta que ya existe. Cancelar y reprogramar desde el link siguen
    funcionando.
  - **Al paciente, un mensaje y no un error:** "Este consultorio no está
    recibiendo reservas en línea por ahora", con el "WhatsApp o teléfono para
    pacientes" de la sede si un administrador lo agregó (opcional, vacío al
    principio). Es la única excepción aceptada a "el médico no coordina nada",
    y la decide el médico al no pasar a un plan mayor.
  - **El médico ve lo que pierde:** el administrador ve en el panel, en la
    tarjeta de uso de Inicio, cuántos pacientes intentaron reservar y no
    pudieron ("Este mes, 3 pacientes intentaron reservar y no pudieron"), con
    la mejora de plan. Las reservas perdidas se ven sólo en el panel, sin
    correo.
  - **Al 80 % y al 100 %** se avisa por correo al dueño de la cuenta.
  - **Siguiente paso (post pay):** al 80 % se ofrece agregar tarjeta; si la
    agrega, al llegar al tope pasa solo al plan siguiente sin ningún corte.
    Requiere guardar tarjeta con Culqi, así que se lanza primero el bloqueo.

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
- **Cada médico ve sólo lo suyo:** en su agenda, sólo sus citas y sólo en la
  sede donde está; nunca las de otros médicos ni las de otras sedes.
- **La ficha es del consultorio,** a diferencia de la agenda: cualquier miembro
  de la sede ve a todos sus pacientes, y el historial de un paciente muestra sus citas en todas las sedes
  de la organización, nunca las de otra organización. La ficha (datos de salud y
  de contacto) es una sola por cuenta: en una cuenta con varias organizaciones
  se comparte entre ellas. Decidido el 25 de octubre de 2026
  (`docs/features/pacientes-busqueda/plan.md`, D-8, D-11 y r-10).
- **El plan se nota, no falla:** una función fuera del plan muestra la mejora de
  plan (402), no un error. El plan que se paga es el plan que se tiene: al bajar
  de plan no se conserva ninguna función del anterior.
- Español de Perú, soles, huso `America/Lima`.

## Preguntas abiertas
- **¿Quién usa el panel?** El médico independiente muchas veces no tiene
  asistente: el usuario sería él, desde el celular entre consultas. "Mi día" ya
  se diseñó mobile-first; falta validarlo con médicos reales.
- **Precio sin límite de médicos.** Una clínica de 10 médicos y un consultorio
  de 1 pagan lo mismo si caben en el mismo tope de citas. ¿Basta con el tope y
  las sedes para separar los planes, antes de descongelar el cobro?
- **Precios frente a la competencia:** tipo de cambio usado y si el precio de
  AgendaPro es plano o por profesional. Pendiente de discutir.
- **Respuestas del paciente por WhatsApp** (cuando existan los recordatorios).
  Si responde un recordatorio ("¿puedo llegar 15 minutos tarde?"), el número de
  WizyDoc no recibe respuestas y el mensaje se pierde. ¿Se acepta como costo de
  la tesis o se guía al paciente a otro canal?

## Riesgos conocidos
- **Sin recordatorios ni WhatsApp.** WhatsApp es el canal que el paciente usa en
  Perú y todos los competidores directos lo ofrecen. Al dejarlos fuera de las
  prioridades, WizyDoc compite sin ellos y las inasistencias no tienen freno
  automático.
- **Bloquear los datos de salud al bajar a Gratis.** El consultorio es el titular
  de los datos de sus pacientes (Ley 29733): si deja de poder leerlos, tampoco
  puede atender a un paciente que pida acceso a sus datos. Los datos básicos
  siguen visibles en Gratis. Riesgo aceptado el 18 de
  octubre de 2026; validar con un abogado.
- **Foco en médico independiente vs. código pensado para clínicas**
  (organizaciones, sedes, roles): el onboarding del médico solo debe esconder esa
  complejidad.
- **El tope de 10 citas al mes en la beta.** El onboarding sólo ofrece Gratis y
  los planes de pago se asignan a mano: un médico con 2 o 3 pacientes al día
  llega al tope en menos de una semana, y desde ahí sus pacientes no pueden
  reservar hasta que se le asigne un plan. Decidido aplicarlo ya el 18 de
  octubre de 2026; el número es una hipótesis por validar con médicos reales.
- **Cerrar el link de un consultorio con reservas falsas.** Cualquiera puede
  cerrar el link durante todo el mes: en Gratis bastan 10 reservas con DNI al
  azar y un correo desechable, porque el contador nunca baja y el panel todavía
  no cancela citas. Antes, bloquear la agenda exigía ocupar cientos de
  horarios. Riesgo aceptado para la beta el 26 de octubre de 2026: mientras
  tanto, WizyDoc puede reabrir un link a mano, corrigiendo el contador o
  asignando un plan. El límite por IP en `POST /appointment` (WIZ-44) es
  requisito antes de reactivar el cobro con Culqi.
- **El sitio publicado** (wizydoc.app) muestra planes anteriores, distintos a
  estos.

## Estado
Beta. Mercado inicial: Perú.

- **Existe** (según el código revisado el 18 de octubre de 2026): reserva
  pública, agenda del día por médico, disponibilidad semanal, ficha del paciente
  con historial de citas (planes de pago), métricas por sede, invitaciones y
  suscripciones con Culqi. Autogestión de la cita por link (cancelar con motivo
  y reprogramar una vez, hasta 12 horas antes; planes de pago) con sus correos al
  paciente y al médico. "Mi perfil": una página por persona, desde el avatar de
  la barra superior o del menú lateral, con datos personales, tratamiento del
  médico (Dr./Dra.; sin él se muestra solo el nombre completo), "Dónde atiendes"
  y cambio de contraseña.
- **Existe desde octubre de 2026:**
  - **El administrador también atiende** (PR #110, 24 de octubre; especialidades
    desde "Mi perfil", PR #108, 22 de octubre). Todo administrador de la organización
    queda como médico, sin especialidad ni horario, de cada sede que se crea, y
    aparece en el booking en cuanto tiene las dos. El administrador de la
    organización y el dueño eligen sus especialidades en "Mi perfil" › "Dónde
    atiendes"; el médico invitado las ve en solo lectura.
  - **Primer uso** (25 de octubre, `docs/features/primer-uso/plan.md`). El
    onboarding es un solo formulario, "Tu consultorio"
    (nombre, dirección y especialidad). Crea la organización y la sede, con el
    dueño como administrador y como médico con esa especialidad, y lo deja en el
    panel de su sede. El dueño de una cuenta de la beta sin consultorio ve el
    mismo formulario ("Termina de crear tu consultorio").
  - **El panel dice qué falta.** Quien atiende y todavía no aparece en el link de
    reservas ve una guía de primeros pasos (especialidad y horario) que
    desaparece sola. "Copiar link de reservas" sólo aparece cuando el link
    funciona, junto a "Ver como paciente".
  - **Tope de citas al mes** (`docs/features/tope-citas-mes/prd.md`). Cuenta las
    citas reservadas en el booking por mes calendario de Lima (Gratis 10,
    Consultorio 150, Clínica 600; Red sin tope) y ningún plan limita médicos.
    Al llegar al tope, el booking de todas las sedes muestra "Este consultorio
    no está recibiendo reservas en línea por ahora", con el "WhatsApp o
    teléfono para pacientes" de la sede si un administrador lo agregó. Lo ya
    reservado y la autogestión siguen igual. El administrador ve en Inicio el
    uso del mes y las reservas perdidas; el dueño recibe un correo al 80 % y
    otro al 100 %.
- **Cobro con Culqi congelado durante la beta.** Sólo crea la suscripción al
  registrarse; no hay renovación, pagos fallidos ni cancelación. El onboarding
  sólo ofrece Gratis y los planes de pago se asignan a mano.
- **No existe todavía:** datos básicos del paciente en Gratis (hoy toda la ficha
  es de pago), "Mi día", estados de cita (toda cita queda pendiente), etiquetas
  de autogestión en el panel ("Cancelada por el paciente", "Reprogramada por el
  paciente"), cancelar o mover citas desde el
  panel, agenda semanal, recordatorios (hoy sólo los correos de reserva,
  cancelación y reprogramación), WhatsApp, importación desde Excel y exportación
  CSV.
