# PRD: tope de citas al mes

**Estado:** v2, 25 de octubre de 2026: el humano decidió las siete preguntas de la v1 (d-12 a d-18).
26 de octubre de 2026: n-1 y A-12 aclarados con la DP-3 del plan; riesgo aceptado rg-12 ·
**Autor:** product-manager · **Rama:** `feat/monthly-appointment-cap`
**Referencias:** `docs/PRODUCT.md` («Prioridades › Límites por citas», «Planes», «Principios»),
`docs/features/autogestion-paciente/prd.html`, `docs/features/primer-uso/plan.md` (PR #126),
términos y condiciones de `web/` (sección 5).

Este documento dice **qué** se construye y **por qué**. El **cómo** (datos, rutas, arquitectura) lo
deciden el planner y el engineer. Si algo de aquí choca con el `plan.md`, manda este PRD. Los textos
entre comillas son propuestas hasta que el humano apruebe el mockup; desde entonces manda el mockup.

**Leyenda**
- **[Decisión]** firme, tomada por el humano.
- **[Propuesta]** regla que propongo; queda firme cuando el humano la apruebe. Las que dependían de
  q-1 a q-7 ya están decididas (sección 14) y llevan la etiqueta de su decisión.
- **[Supuesto]** detalle que propongo y que no pide una decisión aparte, salvo que el humano lo objete.
  **[Supuesto aceptado]**: el humano no lo objetó al decidir la v1.
- **[Riesgo]** conocido, aceptado o por mitigar.

## Resumen

- Cuenta cada cita que un paciente reserva en el booking, **en el mes calendario de Lima en que la
  reserva**, sea cual sea la fecha de la cita. Una cita contada no se descuenta nunca: ni al
  cancelarla ni si queda en «no asistió». Reprogramar no la cuenta otra vez.
- El tope es de la cuenta: suma todas sus sedes y todos sus médicos.
- Al llegar al tope se cierra entero el link de cada sede hasta el 1 del mes siguiente o hasta pasar
  a un plan mayor. El paciente ve el mensaje apenas abre el link (o al confirmar, si el tope se
  alcanzó mientras reservaba), con el contacto que el consultorio haya decidido mostrar.
- Lo ya reservado no cambia, y cancelar o reprogramar desde el link sigue funcionando.
- El ADMIN ve el uso del mes y las reservas perdidas en Inicio. El dueño de la cuenta recibe un correo
  al 80 % y otro al 100 %. Las reservas perdidas no generan correos: solo se ven en el panel.
- Topes: Gratis, 10; Consultorio, 150; Clínica, 600; Red, a medida y sin tope.
- De una reserva perdida solo se guardan la cuenta, la sede y el momento.
- Hoy la sede no tiene un contacto público. Se suma un campo nuevo y opcional por sede, «WhatsApp o
  teléfono para pacientes», que agrega un ADMIN.
- Cambia `entitlements.ts` y `plan.ts` del dominio, con autorización del humano (d-18).

---

## 0. Decisiones tomadas

Son firmes; el resto del documento las aplica.

| Id | Decisión | Fuente |
| --- | --- | --- |
| d-1 | Cada plan tiene su tope de citas al mes; el de Gratis es 10. Se aplica ya, también durante la beta. | `PRODUCT.md`, 18 oct 2026 |
| d-2 | Ningún plan limita médicos ni pacientes. Lo que limita cada plan son las citas al mes y las sedes. | `PRODUCT.md`, 18 oct 2026 |
| d-3 | Las citas ya reservadas no se tocan: se frena la reserva nueva, no la consulta que ya existe. | `PRODUCT.md` |
| d-4 | Al paciente, un mensaje y no un error: «Este consultorio no está recibiendo reservas en línea por ahora», con el contacto del consultorio. Es la única excepción aceptada a «el médico no coordina nada». | `PRODUCT.md` |
| d-5 | El médico ve lo que pierde: se le avisa de las reservas que no se pudieron hacer, con la mejora de plan. Ese aviso, y no el bloqueo, es lo que empuja a pagar. | `PRODUCT.md` |
| d-6 | Al 80 % se avisa al médico. | `PRODUCT.md` |
| d-7 | Una cita en «no asistió» cuenta para el tope, porque es una cita ya creada. | Humano, 24 oct 2026 |
| d-8 | Queda fuera el «siguiente paso post pay»: ofrecer agregar tarjeta al 80 % y pasar solo al plan siguiente. | `PRODUCT.md` |
| d-9 | La sede del primer uso se crea sin teléfono. Razón del planner, aprobada: si una función necesita mostrar un contacto (cita expresamente este tope), lo pide esa función. | `primer-uso/plan.md`, D-2 a, 25 oct 2026 |
| d-10 | Al bajar de plan no se conserva nada del anterior, de inmediato y sin excepciones. | `PRODUCT.md` |
| d-11 | El paciente nunca ve mensajes de plan; la mejora de plan es asunto del consultorio. | Autogestión, d-15 y r-12 |
| d-12 | Una cita cuenta en el momento en que se crea, sea para la fecha que sea: por fecha de la reserva. En palabras del humano: «cuando se crea la cita, no importa en qué fecha. El momento en el que se crea la cita ahí el contador sube». Resuelve q-1. | Humano, 25 oct 2026 |
| d-13 | Las citas canceladas cuentan igual: el contador solo sube. Resuelve q-2. | Humano, 25 oct 2026 |
| d-14 | Topes al mes: Consultorio, 150; Clínica, 600; Red, a medida y sin tope. Resuelve q-3. No es la recomendación de la v1 (300 y 1,500). | Humano, 25 oct 2026 |
| d-15 | Un campo nuevo y opcional por sede, «WhatsApp o teléfono para pacientes»: empieza vacío, lo agrega un ADMIN y no se precarga. Resuelve q-4. | Humano, 25 oct 2026 |
| d-16 | Sin correo de reservas perdidas: se ven solo en el panel, en la tarjeta de uso. Los correos al dueño al 80 % y al 100 % se mantienen. Resuelve q-5. No es la recomendación de la v1. | Humano, 25 oct 2026 |
| d-17 | En el mes del lanzamiento cuenta el mes entero, también lo reservado antes del despliegue. Resuelve q-6 (antes: «desde el despliegue», 25 oct 2026). | Humano, 29 oct 2026 |
| d-18 | Autorizado cambiar `entitlements.ts` y `plan.ts` del dominio (`api/src/domain/entities/subscription/`). `api/src/plugins/entitlements.ts` solo se toca si el engineer demuestra que hace falta, y en ese caso se vuelve a preguntar al humano. Resuelve q-7. | Humano, 25 oct 2026 |

Quedan aceptados, porque el humano no los objetó al decidir la v1, estos supuestos: solo el dueño
recibe los correos (e-1), el panel dice «este mes» (r-4), al paciente no se le dice cuándo reabre el
link (p-1) y la sede adicional de Clínica no suma citas (sección 9).

---

## 1. Problema y objetivo

**Problema.** El 18 de octubre se decidió que los planes se separen por citas al mes y sedes, no por
médicos (d-2). El código no cuenta citas: Gratis recibe reservas sin límite, y un consultorio de una
sede no tiene motivo para pasar de Consultorio a Clínica salvo las métricas. `maxDoctors` sigue en la
definición de los planes, aunque ya nadie lo lee.

**Objetivo.** Que el límite del plan siga al trabajo que WizyDoc le ahorra al consultorio (las citas
que llegan sin que nadie coordine) y que llegar a él empuje a pagar. Llegar al tope no debe romper
nada al paciente ni a lo ya reservado.

**Métricas.** No se miden en esta entrega. Como el producto guarda cada reserva perdida (sección 7.2),
más adelante se podrán contar por cuenta y por mes desde el lanzamiento.

---

## 2. Usuarios

| Usuario | Qué hace en esta entrega | Qué no hace |
| --- | --- | --- |
| **Dueño de la cuenta** (en el foco, el médico independiente: dueño, ADMIN y médico a la vez) | Ve el uso del mes y las reservas perdidas en Inicio. Recibe los correos del 80 % y del 100 %. Pide el plan siguiente. Elige el contacto que verán sus pacientes cuando el link esté cerrado. | No configura el tope, no compra citas sueltas, no ve quién intentó reservar. |
| **Otros ADMIN** (de la organización o de una sede) | Ven en Inicio lo mismo que el dueño y pueden elegir el contacto de su sede. | No reciben los correos. |
| **DOCTOR y USER** (médico invitado, recepción) | Con el tope alcanzado, ven en Inicio que el link no recibe reservas. | No ven números de uso, no ven la mejora de plan, no reciben correos. |
| **Paciente sin cuenta** | Con el tope alcanzado, ve el mensaje al abrir el link y, si el consultorio lo eligió, un botón para escribir o llamar. Si tiene link de autogestión, cancela y reprograma como siempre. | No ve el plan, el tope ni cuándo vuelve a abrir el link. No deja sus datos. |

---

## 3. Alcance

### Entra
- Contar las citas reservadas de cada cuenta por mes calendario de Lima (sección 4).
- Cerrar el booking de todas las sedes de la cuenta al llegar al tope, con el mensaje de d-4 (sección 5).
- Un contacto opcional por sede para ese mensaje (sección 6).
- La tarjeta de uso del mes en el Inicio de cada sede, para ADMIN (sección 7.1).
- Contar las reservas perdidas y mostrarlas en la tarjeta de uso (sección 7.2).
- Correos al dueño al 80 % y al 100 % (sección 7.3).
- El estado del link en Inicio, para todos los roles, con el tope alcanzado (m-3).
- Los topes de Consultorio (150), Clínica (600) y Red (sin tope) (sección 9, d-14).
- Quitar los médicos de la definición de los planes (d-2).
- Actualizar los documentos de la sección 12.

### Fuera
- Ofrecer tarjeta al 80 % y pasar solo al plan siguiente (d-8).
- Comprar citas sueltas o paquetes de citas.
- Topes configurables por cuenta, también los «a medida» de Red: Red queda sin tope (pc-6).
- Desglose del uso por sede o por médico, e historial de meses anteriores.
- Una página de plan o suscripción en el panel.
- Avisos al médico por WhatsApp, y un correo cuando el link vuelve a abrirse el día 1.
- Correos por reservas perdidas: se ven solo en el panel (d-16).
- Mostrar al paciente cuándo vuelve a abrir el link.
- Guardar los datos de quien no pudo reservar, o una lista de espera (`PRODUCT.md`, «No por ahora»).
- Editar el nombre o la dirección de la sede (backlog, «Renombrar sede»).
- La tarjeta de uso en el Inicio de la organización.
- Citas registradas desde el panel: no existen (`docs/capacidades.md`, «Registrar una cita tomada por
  teléfono»: Próximo). Recomendación para cuando existan: que no cuenten ni se bloqueen, porque el tope
  limita las reservas en línea, como dicen los términos («no podrán reservar nuevas citas en línea»).
  Lo decide esa feature.

### Siguiente (candidatos, sin compromiso)
- El «siguiente paso post pay» de `PRODUCT.md`.
- La tarjeta de uso en el Inicio de la organización, si los clientes de Clínica la piden.
- Medir la conversión: reservas perdidas antes de pedir un plan.

---

## 4. Qué cuenta como cita del mes

Cada regla la valida el servidor, no solo la pantalla.

| Id | Regla | Por qué |
| --- | --- | --- |
| c-1 | **[Decisión d-12]** Cuenta **cada cita que un paciente reserva en el booking público** de cualquier sede de la cuenta. Una reserva es una cita. Hoy el booking es la única forma de crear una cita. | El tope mide lo que WizyDoc le ahorra al consultorio: citas que llegan sin que nadie coordine. Los términos ya hablan de «citas reservadas al mes». |
| c-2 | **[Decisión d-12]** Una cita cuenta **en el mes en que se reserva**, no en el de la cita: el contador sube en el momento en que se crea. Ejemplo: una cita del 5 de diciembre reservada el 20 de noviembre cuenta en noviembre. | El link se cierra y se abre entero, reprogramar no choca con el tope, el médico tiene un solo número y coincide con los términos («hasta el mes siguiente»). Ver la alternativa descartada, debajo. |
| c-3 | **[Propuesta]** El mes es el **calendario de Lima**: desde el día 1 a las 00:00 hasta el último día a las 23:59, hora de Lima, según el momento en que WizyDoc acepta la reserva. No depende del huso del paciente, del navegador ni del servidor. | Huso `America/Lima` (`PRODUCT.md`). «Se renueva el 1» se entiende sin explicación. No se usa el ciclo de cobro: el cobro está congelado y los planes se asignan a mano, así que no hay ciclo. |
| c-4 | **[Decisión d-13]** Una cita contada **no se descuenta nunca**: ni si la cancela el paciente desde el link, ni si la cancela el consultorio (cuando pueda hacerlo), ni si queda «atendida» o en «no asistió». Cancelar no reabre el link. | Es la razón de d-7: es una cita ya creada. Con un contador que solo sube, el link no se cierra y se reabre varias veces en el mes, y los avisos del 80 % y el 100 % salen una sola vez. Además, nadie libera cupo cancelando en el sistema una cita que igual atiende. Costo: en pago, cada cancelación gasta una cita del tope (rg-3). En Gratis casi no hay cancelaciones hoy: la autogestión es de pago y el panel no cancela. |
| c-5 | **[Propuesta]** **Reprogramar no cuenta otra vez**, aunque cambie de mes o de médico: es la misma cita (autogestión, r-7). | No es una reserva nueva. Contarla castigaría al consultorio por usar la función por la que paga. |
| c-6 | **[Decisión d-7 + Propuesta]** Cuenta la cita en cualquier estado: pendiente, atendida, no asistió o cancelada (y confirmada, si algún día vuelve). | Lo que se cuenta es la reserva, no lo que pasó después. |
| c-7 | **[Propuesta]** El tope es **de la cuenta**: suma las reservas de todas sus sedes y de todos sus médicos. | El plan es de la cuenta (`PRODUCT.md`, «Planes»). Consecuencia: en Clínica, una sede con mucho movimiento puede cerrar el link de las otras (rg-4). |
| c-8 | **[Propuesta]** El tope **nunca se supera**, ni con dos reservas simultáneas por la última cita disponible: una entra y la otra ve el mensaje del tope (t-3). | «10 al mes» tiene que ser 10, y el médico nunca debe ver «11 de 10». |
| c-9 | **[Decisión d-17]** En el mes del lanzamiento cuentan todas las citas creadas en el mes, también las anteriores al despliegue. | Se cuentan las citas de `appointment`, sin contador aparte. Costo: una cuenta Gratis con 10 o más citas ese mes queda con el link cerrado el día del despliegue, sin el aviso del 80 %. |

### Alternativa descartada: contar por la fecha de la cita

Descartada por el humano el 25 de octubre de 2026 (d-12). Las razones de la v1:

- El booking ofrece horarios hasta 52 semanas adelante. Cada mes futuro tendría su propio cupo, el
  link casi nunca se cerraría entero y el paciente casi siempre encontraría un mes con cupo. En
  Gratis el tope casi no frenaría nada, y el mensaje «no está recibiendo reservas por ahora» no
  tendría un momento claro.
- El paciente descubriría el tope al elegir la fecha y no al abrir el link, y el selector tendría que
  mostrar meses llenos.
- Habría que bloquear reprogramar a un mes lleno, y el paciente con link terminaría llamando, que es
  justo lo que elimina la tesis.
- El médico vería un contador por cada mes futuro, y el 80 % podría cruzarse en varios meses a la vez.
- A favor: mide las consultas de cada mes y no las reservas. No compensa lo anterior.

---

## 5. Qué pasa al llegar al tope

### 5.1 El link de reservas

| Id | Regla | Por qué |
| --- | --- | --- |
| t-1 | **[Propuesta]** Al llegar al tope, el booking de **todas las sedes** de la cuenta deja de aceptar reservas **para cualquier fecha**. Vuelve a aceptarlas cuando ocurra lo primero: el día 1 del mes siguiente a las 00:00 (hora de Lima), o que la cuenta pase a un plan cuyo tope supere las citas ya contadas en el mes. | c-2 y c-7. Es lo que dicen los términos: «hasta el mes siguiente o hasta que el Usuario pase a un plan mayor». |
| t-2 | **[Propuesta]** El paciente ve el mensaje **al abrir el link**, antes de elegir especialidad, médico u horario. | No se le hace llenar un formulario que no va a poder enviar. El booking se completa en menos de un minuto (`PRODUCT.md`). |
| t-3 | **[Propuesta]** Si el tope se alcanza **mientras el paciente reserva** (abrió el link con cupo y otro paciente tomó la última cita), al confirmar ve el mismo mensaje en lugar de «¡Cita reservada!». No se crea la cita, no sale ningún correo y lo que escribió no se guarda. Si además el horario ya estaba tomado, se muestra el mensaje del tope. | Elegir otro horario no le serviría. |
| t-4 | **[Propuesta]** El servidor valida el tope en cada reserva, también si llega sin pasar por la página. | Una regla que solo aplica la pantalla no es una regla. |
| t-5 | **[Supuesto]** Si la sede no tiene ningún médico con horario, se ve el mensaje de hoy («Esta sede todavía no tiene médicos disponibles para reservar citas.») y no el del tope. Esa visita no cuenta como reserva perdida. | Sin médicos, el link no funcionaría ni con cupo. Contar la visita inflaría las reservas perdidas. |

### 5.2 Lo que ve el paciente

Todas las variantes llevan la cabecera actual del booking (médico o sede, y dirección), sin pasos ni
barra de progreso, y el título **«Este consultorio no está recibiendo reservas en línea por ahora»**.

| Variante | Cuándo | Debajo del título |
| --- | --- | --- |
| Con celular | La sede tiene un celular para pacientes (sección 6) | «Para pedir una cita, escribe o llama al consultorio.» y los botones «Escribir por WhatsApp» (abre un chat con «Hola, quiero pedir una cita en {sede}.») y «Llamar al 987 654 321». |
| Con teléfono fijo | La sede tiene un fijo | «Para pedir una cita, llama al consultorio.» y el botón «Llamar al (01) 234 5678». |
| Sin contacto | La sede no tiene contacto | «Vuelve a intentarlo más adelante.», sin botones. |

- **p-1 [Supuesto aceptado] Nunca aparece** el plan, el tope, cuántas citas hubo, cuándo vuelve a abrir, una
  mejora de plan, «error» ni «Algo salió mal» (d-4, d-11). No se dice la fecha de reapertura porque
  revelaría la mecánica del plan y porque puede abrir antes, si el médico cambia de plan. «Por ahora»
  y «más adelante» son ciertos en todos los casos.
- **p-2 [Supuesto]** Mobile-first: a 375 px no hay desplazamiento horizontal, los botones van a lo
  ancho y miden al menos 44 px de alto, y el mensaje se anuncia a los lectores de pantalla.
- **p-3 [Supuesto]** La página no pide nada al paciente: ni correo, ni teléfono, ni «avísame cuando
  abra».

### 5.3 Autogestión y citas ya reservadas

| Id | Regla | Por qué |
| --- | --- | --- |
| a-1 | **[Decisión d-3]** Las citas ya reservadas siguen igual: en la agenda, en la ficha y con sus correos. | Se frena la reserva nueva, no la consulta. |
| a-2 | **[Propuesta]** Con el tope alcanzado, el paciente con link **cancela y reprograma como siempre**, con las reglas de la autogestión (12 h, una sola reprogramación, mismo médico salvo que no tenga horarios). **Reprogramar a cualquier fecha, también a otro mes, no se bloquea**: con c-2 no existen «meses llenos». | Reprogramar no es una reserva nueva (c-5). Bloquearlo empujaría al paciente a llamar. |
| a-3 | **[Supuesto]** «Reservar otro horario», en la página de una cita cancelada, lleva al booking, que con el tope alcanzado muestra el mensaje. Quien quiere cambiar de horario tiene «Reprogramar», que no se bloquea. | Una sola regla para el booking. |

---

## 6. El contacto del consultorio

**El hueco.** d-4 pide mostrar «el contacto del consultorio», y hoy la sede no tiene un contacto
público:
- El teléfono de la sede es obligatorio al crearla desde el panel, pero solo se ve en la tabla de
  Sedes. Las sedes del primer uso se crean sin él (d-9).
- El booking y los correos no muestran contacto (autogestión, s-2).
- No hay pantalla para editar una sede (backlog, «Renombrar sede»).
- El celular del registro es el personal de quien se registró.

**Decidido el 25 de octubre de 2026 (d-15): opción a.** Las opciones que se evaluaron:

| Opción | Qué es | A favor | En contra |
| --- | --- | --- | --- |
| **a) Dato nuevo por sede** (recomendada y elegida) | «WhatsApp o teléfono para pacientes», opcional. Lo agrega un ADMIN desde la tarjeta de uso (7.1). Se muestra solo en la página del link cerrado. | Es lo que anticipó el primer uso (d-9). Se pide cuando el médico entiende para qué sirve, y no espera a otro ticket. Quien no lo llena queda como en la opción d. | Suma un formulario de un campo a esta entrega. |
| b) Esperar a «Editar sede» | El dato se edita en esa feature del backlog; hasta entonces, el mensaje sale sin contacto. | No suma nada aquí. | El tope sale primero, así que durante un tiempo ningún paciente vería contacto. |
| c) Usar el teléfono que ya tiene la sede | El de las sedes antiguas; las nuevas, sin nada o con el celular del registro. | Sin formulario nuevo. | Se escribió para una tabla interna, no para pacientes. El humano ya descartó en el primer uso que el celular personal se publique sin que el médico lo decida (D-2). |
| d) Nunca mostrar contacto | Solo el mensaje. | Lo más simple. Quien recibió el link por WhatsApp ya tiene el número del médico. | Quien llegó desde Instagram o Google se queda sin salida (rg-6). |

**Reglas del contacto** (k-2, k-3 y k-7 aplican d-15; el resto lo propongo yo). El campo se llama
«WhatsApp o teléfono para pacientes».
- **k-1** Un contacto por sede. Cada booking muestra el de su sede.
- **k-2** Es opcional. Sin él se ve la variante «Sin contacto» (5.2).
- **k-3** Solo un ADMIN de la sede o de su organización lo agrega, lo cambia o lo borra.
- **k-4** Es un número peruano. Si es un celular (9 dígitos que empiezan con 9), la página ofrece
  WhatsApp y llamar; si es un fijo, solo llamar. Un número inválido muestra un error en español.
- **k-5** El formulario dice para qué es: «Lo verán tus pacientes cuando tu link no esté recibiendo
  reservas.»
- **k-6** Por ahora solo se muestra en la página del link cerrado. Cuando exista «Editar sede», el
  mismo dato también se edita ahí.
- **k-7** Empieza vacío en todas las sedes. No se precarga con el celular del registro ni con el
  teléfono antiguo de la sede.

---

## 7. Lo que ve el consultorio

### 7.1 Uso del mes en el panel (ADMIN)

Una tarjeta en el **Inicio de cada sede**, para ADMIN, en los planes con tope. Hoy el panel no
muestra el plan en ningún lugar: esta tarjeta es donde el plan «se nota» (`PRODUCT.md`, «Principios»).

| Estado | Cuándo (Gratis) | Qué se ve |
| --- | --- | --- |
| Normal | Menos del 80 % (0 a 7) | «Citas reservadas en noviembre: 5 de 10», una barra y «Plan Gratis · Se renuevan el 1 de diciembre.» |
| Cerca del tope | Del 80 % al 99 % (8 y 9) | «Llevas 8 de las 10 citas de tu plan en noviembre», «Cuando llegues a 10, tu link dejará de recibir reservas hasta el 1 de diciembre. Las citas ya reservadas no cambian.», «El plan Consultorio incluye 150 citas al mes.» y el botón «Pedir el plan Consultorio». Si la sede no tiene contacto: «Agrega un número para que tus pacientes puedan contactarte cuando no recibas reservas.» y «Agregar número». |
| Tope alcanzado | 100 % (10 o más) | «Tu link no está recibiendo reservas», «Llegaste al tope de 10 citas de tu plan Gratis en noviembre. Vuelve a recibir reservas el 1 de diciembre, o desde que pases al plan Consultorio (150 citas al mes).», las reservas perdidas (7.2; es el único lugar donde se ven, d-16) y lo que ven los pacientes: «Tus pacientes ven el aviso «Este consultorio no está recibiendo reservas en línea por ahora» y el número 987 654 321.» con «Cambiar», o «… y ningún número para contactarte.» con «Agregar número». Y el botón «Pedir el plan Consultorio». |

- **m-1 [Propuesta]** Para ADMIN, la tarjeta se ve siempre en los planes con tope, no solo cerca de
  él. En Red no aparece. En Gratis, entre el aviso del 80 % y el cierre hay solo 2 citas, que pueden
  llegar en una mañana: el médico tiene que ver el número desde antes.
- **m-2 [Supuesto]** La etiqueta dice «reservadas en {mes}» para que el número no se confunda con las
  citas que hay en la agenda de ese mes (rg-7). Nunca muestra más citas que el tope («120 de 10»):
  desde el tope dice «Llegaste al tope de 10 citas».
- **m-3 [Propuesta]** Con el tope alcanzado, el estado del link en Inicio (primer uso, L-2: «Tus
  pacientes ya pueden reservar desde el link.») pasa a decir «Tu link no está recibiendo reservas este
  mes.», para todos los roles. «Copiar link de reservas» sigue disponible, porque el link vuelve a
  abrir el día 1. El panel nunca dice que el link recibe reservas mientras está cerrado.
- **m-4 [Supuesto]** «Mi día» rehará el Inicio. La tarjeta irá donde decida «Mi día», con las mismas
  reglas.

### 7.2 Reservas perdidas

| Id | Regla | Por qué |
| --- | --- | --- |
| r-1 | **[Propuesta]** Cuenta como reserva perdida: cada vez que una persona abre el link con el tope alcanzado y ve el mensaje, y cada reserva rechazada al confirmar (t-3). | Es la señal de d-5: un paciente quiso reservar y no pudo. |
| r-2 | **[Propuesta]** Un mismo navegador cuenta **una sola vez por día** (hora de Lima), aunque recargue o vuelva a abrir el link. | El número tiene que ser creíble. Si cada recarga sumara, el médico vería pacientes que no existen; el aviso perdería fuerza y sería una presión engañosa. |
| r-3 | **[Propuesta]** No cuentan: las vistas previas automáticas que se generan al compartir el link (WhatsApp, Facebook, buscadores); las visitas de alguien con sesión iniciada en la cuenta del consultorio («Ver como paciente»); las visitas a una sede sin médicos (t-5). | Ninguna es un paciente que quiso reservar. |
| r-4 | **[Supuesto aceptado]** El panel dice «Este mes, 3 pacientes intentaron reservar y no pudieron.» Con 1: «Este mes, 1 paciente intentó reservar y no pudo.» Con 0 no se muestra. Usa «este mes» y no «esta semana» (el ejemplo de `PRODUCT.md`). | El tope y su renovación son mensuales, y una semana puede caer entre dos meses. Es aproximado: el mismo paciente en dos días distintos cuenta dos veces (rg-5). |
| r-5 | **[Supuesto]** No se desglosa por sede ni por médico. | Simple antes que completo. |
| r-6 | **[Decisión d-16]** Las reservas perdidas **solo se ven en la tarjeta de uso** del Inicio, para ADMIN. No generan correos ni otros avisos. | Decisión del humano. Consecuencia: quien no abre el panel no se entera (rg-11). |

### 7.3 Correos al dueño de la cuenta

Son dos: el del 80 % y el del 100 %. Las reservas perdidas no tienen correo (d-16).

- **e-1 [Supuesto aceptado] Destinatario:** solo el dueño de la cuenta, a su correo de usuario. Es quien decide
  el plan; en el médico independiente es el mismo médico. Los demás ADMIN lo ven en el panel.
- **e-2 Aviso del 80 %**, cuando una reserva lleva las citas del mes al 80 % del tope (8 de 10; 120 de
  150; 480 de 600). Sale una vez por mes y por tope.
  - Asunto: «Llevas 8 de las 10 citas de tu plan este mes».
  - Cuerpo: «Hola {nombre de pila}, tus pacientes ya reservaron 8 de las 10 citas que incluye tu plan
    Gratis en noviembre. Cuando lleguen a 10, tu link de reservas dejará de recibir citas hasta el 1
    de diciembre. Las citas ya reservadas no cambian. El plan Consultorio incluye 150 citas al mes.»
  - Botón «Pedir el plan Consultorio».
- **e-3 Aviso del 100 %**, con la reserva que llega al tope. Sale una vez por mes y por tope.
  - Asunto: «Tu link de reservas ya no recibe citas este mes».
  - Cuerpo: «Hola {nombre de pila}, tus pacientes reservaron las 10 citas que incluye tu plan Gratis
    en noviembre. Desde ahora, quien abra tu link verá «Este consultorio no está recibiendo reservas
    en línea por ahora». Las citas ya reservadas no cambian. Tu link vuelve a recibir reservas el 1 de
    diciembre, o desde que pases al plan Consultorio, que incluye 150 citas al mes.»
  - **[Supuesto]** Suma: «En tu panel verás cuántos pacientes intentan reservar y no pueden.» Con d-16,
    la tarjeta de uso es el único lugar donde el médico ve lo que pierde (d-5): el correo lo lleva ahí.
  - Botón «Pedir el plan Consultorio».
- **e-4** ~~Correo de reserva perdida.~~ **Descartado el 25 de octubre de 2026 (d-16):** las reservas
  perdidas se ven solo en la tarjeta de uso (r-6).
- **e-5 Reglas comunes:**
  - Ningún correo lleva datos de pacientes: solo cantidades, sede y fechas.
  - Si la sede no tiene contacto, el 80 % y el 100 % suman: «Tus pacientes no verán ningún número para
    contactarte. Puedes agregarlo desde tu panel.»
  - Todos llevan «Ir a mi panel» como segunda acción.
  - Las fechas van en hora de Lima, sin rotular la zona horaria (autogestión, d-20).
  - Si falla un envío, no se revierte nada y no se reintenta.
  - Los correos los provoca una reserva, nunca un cambio de plan ni una reserva perdida (sección 8).

### 7.4 Quien no es ADMIN

- **n-1 [Supuesto]** DOCTOR y USER no ven la tarjeta, ni números, ni el «Pedir el plan» del tope, y no
  reciben correos. Con el tope alcanzado ven en Inicio el estado del link (m-3), con «Un administrador de
  tu cuenta puede cambiar de plan.». Necesitan saber por qué no llegan reservas (recepción atiende el
  teléfono), pero no deciden el plan, y cada médico ve solo lo suyo (`PRODUCT.md`).
  **Aclarado el 26 de octubre de 2026 (DP-3 del plan):** n-1 habla solo de la mejora de plan del tope. El
  aviso de plan de las métricas de Inicio («Pedir el plan Clínica», en Gratis y Consultorio) no cambia: lo
  siguen viendo todos los roles, como hoy.

### 7.5 La mejora de plan

- **u-1 [Supuesto]** Se ofrece el plan siguiente: de Gratis, Consultorio; de Consultorio, Clínica; de
  Clínica, Red. Durante la beta, «Pedir el plan {plan}» abre WhatsApp con WizyDoc, como el aviso de
  plan que ya existe (`plan-feature-notice.tsx`), con el mensaje precargado. Cuando se descongele
  Culqi, lo reemplazará el pago (fuera de alcance).
- **u-2 [Supuesto]** El texto incluye el tope del plan siguiente (d-14): desde Gratis, «El plan
  Consultorio incluye 150 citas al mes.»; desde Consultorio, «El plan Clínica incluye 600 citas al
  mes.»; desde Clínica, «El plan Red se arma a la medida de tu red.»

---

## 8. Cambios de plan y comienzo de mes

| Id | Caso | Qué pasa | Por qué |
| --- | --- | --- | --- |
| pc-1 | **Sube de plan** | El tope nuevo vale desde ese momento y las citas ya contadas en el mes se mantienen. Si quedan por debajo del tope nuevo, el link se abre en la siguiente visita. Ejemplo: Gratis cerrado con 10 pasa a Consultorio y queda en 10 de 150, con el link abierto. Consultorio cerrado con 150 pasa a Clínica y queda en 150 de 600. | El plan que se paga es el plan que se tiene. |
| pc-2 | **Baja de plan**, también a Gratis | El tope nuevo vale de inmediato. Si las citas del mes ya llegan a él, el link se cierra hasta el día 1. Ejemplo: Consultorio con 120 pasa a Gratis y el link se cierra hasta el 1. Las citas ya reservadas no se tocan. | d-10 y d-3. |
| pc-3 | **Suscripción cancelada** | Es Gratis, como hoy, y aplica pc-2. | Una sola regla. |
| pc-4 | **Avisos al cambiar de plan** | El 80 % y el 100 % salen una vez por mes y por tope. Si sube de plan, los del tope nuevo vuelven a avisar; si vuelve a un tope ya avisado en el mes, no se repiten. El cambio de plan no envía correos por sí mismo. Si una bajada cierra el link, no sale ningún correo: el ADMIN lo ve en la tarjeta de uso, con las reservas perdidas (d-16). | Sin correos repetidos. Durante la beta los cambios de plan los hace WizyDoc a mano, así que el humano sabe cuándo una bajada cierra un link. |
| pc-5 | **Comienzo de mes** | El día 1 a las 00:00 de Lima, el contador vuelve a 0, el link se abre solo, las reservas perdidas del mes empiezan en 0 y los avisos se rearman. No sale ningún correo. **[Supuesto]** | Lo dicen la tarjeta y los correos («Se renuevan el 1 de diciembre»). |
| pc-6 | **Red** (d-14) | A medida y sin tope; sin tarjeta de uso. | Decisión del humano. Hoy el producto no tiene topes por cuenta. |

---

## 9. Topes de los planes de pago

**Decidido el 25 de octubre de 2026 (d-14):**

| Plan | Citas al mes | Aviso del 80 % |
| --- | --- | --- |
| Gratis | 10 (d-1) | 8 |
| Consultorio | **150** | 120 |
| Clínica | **600** | 480 |
| Red | A medida, sin tope | No aplica |

Es la opción B de la v1, no la que yo recomendaba (A: 300 y 1,500). El contexto y las opciones de la
v1 quedan debajo como referencia; su consecuencia principal está en rg-10.

`PRODUCT.md` dejaba «por definir» los de Consultorio y Clínica. Antes, los planes se separaban por
médicos: 1, 3 y 8.

**Lo que hace la competencia** (verificado el 25 de octubre de 2026):
- **Doctocliq:** Gratis, 30 «pacientes y citas por mes»; Individual (USD 19 al mes), 50; Básico
  (USD 29) y Avanzado (USD 49), ilimitados.
  [doctocliq.com/planes-y-precios](https://www.doctocliq.com/planes-y-precios)
- **AgendaPro Perú:** todos los planes dicen «Agenda online de citas y clases ilimitadas»; el
  Individual cuesta S/ 59 al mes, con 1 profesional.
  [agendapro.com/pe/planes](https://agendapro.com/pe/planes)

**Cuánto puede recibir un médico por el link.** Cada horario dura 30 minutos (constante del producto).
Las horas de consulta son una **suposición, sin dato**:

| Médico a tiempo… | Horarios por día | Al mes (22 días de consulta) |
| --- | --- | --- |
| Parcial, 4 h al día | 8 | 176 |
| Casi completo, 6 h al día | 12 | 264 |
| Completo, 8 h al día | 16 | 352 |

Es un máximo: supone que todas sus citas llegan por el link.

**Opciones de la v1** (el humano eligió B):

| Opción | Consultorio | Clínica | Red | A favor | En contra |
| --- | --- | --- | --- | --- | --- |
| A (la que recomendé) | 300 | 1,500 | Sin tope | El médico independiente nunca ve su link cerrado mientras paga. Un consultorio de una sede con 2 médicos o más a tiempo completo pasa a Clínica, lo que responde en parte a la pregunta «Precio sin límite de médicos». Clínica cubre los 8 médicos que antes incluía, con la mitad de su agenda por el link. | Sin datos de uso reales: es una hipótesis. |
| **B (elegida)** | 150 | 600 | A medida, sin tope | Más presión para subir de plan. | Un médico a tiempo completo que paga Consultorio vería su link cerrado: el peor resultado posible. |
| C (solo Gratis tiene tope) | Sin tope | Sin tope | Sin tope | Lo más simple; iguala a AgendaPro y al Básico de Doctocliq. | Un consultorio de 10 médicos en una sede pagaría S/ 79. Deja abierta la pregunta «Precio sin límite de médicos». |

**Qué implica B.** Con 150, Consultorio cubre a un médico a tiempo parcial con toda su agenda por el
link, pero no a uno a tiempo completo (176 a 352 al mes según la tabla): ese médico puede ver su link
cerrado mientras paga (rg-10). Con 600, Clínica cubre unos 3 o 4 médicos a tiempo parcial. A cambio, el
tope empuja antes al plan siguiente. Mientras dure la beta, los planes de pago se asignan a mano, así
que estos topes solo afectan a esas cuentas; conviene revisarlos con el uso real antes de descongelar
el cobro.

- **[Supuesto aceptado]** La sede adicional de Clínica (S/ 40) no suma citas: el tope es del plan.
- Consecuencia: la landing tiene que publicar 150 y 600 citas al mes. Hoy, a propósito, no anuncia
  topes de pago (`web/src/components/marketing/pricing.tsx`). Los términos remiten a la página de
  precios.

---

## 10. Privacidad

WizyDoc maneja datos de salud. El consultorio es el titular del banco de datos (Ley 29733); la
redacción legal la valida un abogado.

- **pv-1** De una reserva perdida se guardan **solo la cuenta, la sede y el momento** (fecha y hora).
  Nada más: ni el médico, la especialidad o el horario elegido, ni la IP, el navegador o un
  identificador del dispositivo.
- **pv-2** Lo que el paciente escribió antes de un rechazo (t-3) **no se guarda, no queda en los
  registros del sistema y no llega al médico**, ni siquiera en parte (iniciales, últimos dígitos). El
  paciente no reservó ni aceptó que lo contacten: usar sus datos para que el médico lo llame sería
  volver a coordinar y tratar datos sin una finalidad aceptada.
- **pv-3** La marca que evita contar dos veces el mismo navegador (r-2) vive en el navegador del
  paciente, no lleva identificadores y no se guarda en el servidor.
- **pv-4** Los correos y el panel no llevan datos de pacientes: solo cantidades, sede y fechas.
- **pv-5** El contacto de la sede lo publica el consultorio por decisión propia, y puede ser el
  celular personal del médico: el formulario dice para qué se usa, empieza vacío y no se precarga
  (k-5, k-7).
- **pv-6** La página del link cerrado no carga recursos de terceros. El botón de WhatsApp es solo un
  enlace.
- La política de privacidad no cambia si se cumplen pv-1 a pv-3.

---

## 11. Casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| cl-1 | Dos reservas a la vez por la última cita del mes | Entra una; la otra ve el mensaje (c-8, t-3). |
| cl-2 | Reserva justo al cambiar de mes | Cuenta en el mes de la hora de Lima en que WizyDoc la aceptó (c-3). |
| cl-3 | Paciente que abrió el link con cupo y confirma con el tope ya alcanzado | t-3. |
| cl-4 | Paciente que vio el link cerrado y vuelve el día 1, o después de que el médico subió de plan | Ve el booking normal. |
| cl-5 | El médico prueba su propio link y reserva | La cita cuenta (c-1). Su visita a la página cerrada no cuenta como reserva perdida (r-3). Ver rg-2. |
| cl-6 | El link se comparte por WhatsApp con el tope alcanzado | La vista previa no cuenta (r-3). |
| cl-7 | Cuenta con varias sedes | Todas cierran a la vez; cada una muestra su contacto (c-7, k-1). |
| cl-8 | Cita reservada en noviembre para diciembre y cancelada en diciembre | Sigue contando en noviembre y no afecta a diciembre (c-2, c-4). |
| cl-9 | Paciente con link que reprograma con el tope alcanzado | Puede, a cualquier fecha (a-2). |
| cl-10 | Sede sin médicos y tope alcanzado | t-5. |
| cl-11 | Bajada de plan con más citas que el tope nuevo | pc-2. La tarjeta dice «Llegaste al tope de 10 citas», no «120 de 10» (m-2). No sale ningún correo (pc-4). |
| cl-12 | Horario tomado y tope alcanzado a la vez | Gana el mensaje del tope (t-3). |
| cl-13 | Falla el envío de un aviso | No se revierte nada ni se reintenta (e-5). |
| cl-14 | Cuenta sin suscripción o con la suscripción cancelada | Es Gratis (pc-3). |

---

## 12. Dependencias y documentos que cambian

### Dependencias
- **`entitlements.ts` y `plan.ts` del dominio (autorizado el 25 de octubre de 2026, d-18).** «Cada
  plan tiene su tope» y «sin límite de médicos» cambian la definición de los planes
  (`api/src/domain/entities/subscription/plan.ts`) y el objeto que dice qué incluye cada plan
  (`api/src/domain/entities/subscription/entitlements.ts`): se suma el tope mensual (10, 150, 600 y sin
  tope en Red) y salen `maxDoctors` y `extraDoctors`. **`api/src/plugins/entitlements.ts` no está
  autorizado:** el booking es público (sin sesión), así que no debería hacer falta. Si el engineer
  demuestra que sí, se vuelve a preguntar al humano antes de tocarlo.
- **Primer uso (PR #126):** m-3 cambia el texto de L-2. Quien entre segundo se adapta al primero.
- **«Mi día»:** m-4.
- **«Editar sede»** (backlog): cuando exista, también editará el contacto (k-6). Esta entrega no
  depende de ella.
- **Límite de peticiones (WIZ-44):** ver rg-5.
- **Estados de cita:** no bloquea. Todos los estados cuentan (c-6).

### Documentos que cambian

| Documento y sección | Cambio |
| --- | --- |
| `docs/PRODUCT.md`, «Planes» | Tabla: Consultorio, 150 citas al mes; Clínica, 600; Red, a medida. «Qué cuenta como cita del mes» pasa a resumir c-1 a c-4 (cuenta al reservarse, las canceladas también) con referencia a este PRD. «El médico ve lo que pierde» pasa a decir que las reservas perdidas se ven en el panel, sin correo. |
| `docs/PRODUCT.md`, «Preguntas abiertas» | Sale «Topes de citas de los planes de pago». |
| `docs/PRODUCT.md`, «Estado» | El tope pasa a «Existe». |
| `docs/capacidades.md`, «Planes y cobro» | Fila del tope: «Hoy». La fila «Límite por sedes» dice que el código aún limita médicos al invitar, y ya no es cierto (nadie lee `maxDoctors`). |
| `web/src/components/marketing/pricing.tsx` | Publicar «150 citas al mes» en Consultorio y «600 citas al mes» en Clínica, en las tarjetas y en la comparativa. |
| Términos de `web/` (sección 5) | Sin cambios: ya dicen «10 citas reservadas al mes» y «hasta el mes siguiente», que coinciden con c-2 y t-1. |

---

## 13. Riesgos

- **rg-1 El tope de 10 en la beta** (ya en `PRODUCT.md`). El empujón depende de que el humano responda
  rápido el «Pedir el plan» por WhatsApp: mientras tanto, los pacientes rebotan.
- **rg-2 Las reservas de prueba gastan el tope.** No se pueden borrar: el panel no cancela citas y en
  Gratis no hay link de autogestión. Un médico nuevo que prueba su link dos veces empieza el mes con 8.
- **rg-3 Las canceladas cuentan** (d-13). Una cuenta de pago con muchas cancelaciones gasta cupo, y con
  150 en Consultorio el margen es menor que el de la v1 (ver rg-10).
- **rg-4 Tope compartido entre sedes.** En Clínica, una sede con mucho movimiento cierra el link de las
  otras.
- **rg-5 Las reservas perdidas son aproximadas.** El mismo paciente en dos días cuenta dos veces, y sin
  límite de peticiones alguien podría simular visitas. No generan correos (d-16) y el número solo
  informa.
- **rg-6 Sin contacto, no hay salida.** El paciente que no tiene el número del médico se queda sin vía
  para pedir la cita. Es la excepción aceptada en d-4, y empeora si el médico no agrega un número.
- **rg-7 El contador y la agenda no coinciden.** El médico puede ver «10 de 10» con pocas citas en la
  agenda del mes, porque reservaron para el siguiente. La etiqueta «reservadas en {mes}» lo mitiga.
- **rg-8 Topes de pago sin datos de uso.** Son una hipótesis (sección 9).
- **rg-9 Reputación de los correos.** Con d-16 queda acotado: como mucho 2 correos al mes por tope (80 %
  y 100 %).
- **rg-10 Un médico que paga Consultorio puede ver su link cerrado** (d-14). Con horarios de 30 minutos,
  un médico que atiende 4 horas al día durante 22 días ofrece 176 horarios al mes (suposición de la
  sección 9), más que el tope de 150. Si recibe por el link la mayor parte de sus citas, sus pacientes
  verán «no está recibiendo reservas» mientras paga. Es el peor resultado de esta feature, y la razón
  por la que yo recomendaba 300. Aceptado por el humano el 25 de octubre de 2026; conviene revisarlo con
  el uso real antes de descongelar el cobro.
- **rg-11 Quien no abre el panel no ve lo que pierde** (d-16). `PRODUCT.md` dice que el aviso de las
  reservas perdidas es lo que empuja a pagar (d-5), y ahora solo está en la tarjeta de uso. El médico
  independiente que no entra al panel (pregunta abierta «¿Quién usa el panel?») recibe el correo del
  100 % y después nada más hasta el día 1. El correo del 100 % le dice que las verá en el panel (e-3).
- **rg-12 Cualquiera puede cerrar el link de un consultorio con reservas falsas** (lo encontró el
  security-reviewer). En Gratis bastan 10 reservas con DNI al azar y un correo desechable para cerrar el
  link durante todo el mes, porque el contador nunca baja (d-13) y el panel todavía no cancela citas.
  Antes de esta feature, bloquear la agenda exigía ocupar cientos de horarios. **Aceptado por el humano
  para la beta el 26 de octubre de 2026.** Mientras tanto, WizyDoc puede reabrir un link a mano,
  corrigiendo el contador o asignando un plan. El límite por IP en `POST /appointment` (WIZ-44) es
  requisito antes de reactivar el cobro con Culqi.

---

## 14. Decisiones del humano

Las siete preguntas de la v1 se decidieron el 25 de octubre de 2026. No quedan preguntas abiertas.

| Id | Pregunta | Opciones | Recomendación de la v1 | Decisión (25 oct 2026) |
| --- | --- | --- | --- | --- |
| q-1 | ¿Las citas cuentan por la fecha de la reserva o por la de la cita? | a) Reserva. b) Cita. | a | **a** (d-12): «El momento en el que se crea la cita ahí el contador sube». |
| q-2 | ¿Cuentan las citas canceladas? | a) Todas; el contador solo sube. b) Ninguna. c) Solo las del consultorio. | a | **a** (d-13). |
| q-3 | Topes de Consultorio, Clínica y Red | A) 300 / 1,500 / sin tope. B) 150 / 600 / sin tope. C) Sin tope en los planes de pago. | A | **B** (d-14): Consultorio 150, Clínica 600, Red a medida y sin tope. Consecuencia en rg-10. |
| q-4 | ¿Qué contacto ve el paciente con el link cerrado? | a) Dato nuevo por sede. b) Esperar a «Editar sede». c) El teléfono que ya tiene la sede. d) Ninguno. | a | **a** (d-15): «WhatsApp o teléfono para pacientes», opcional, vacío al principio, lo agrega un ADMIN, sin precargar. |
| q-5 | ¿Con qué frecuencia se avisa por correo de las reservas perdidas? | a) Como mucho uno por día. b) Uno por intento. c) Resumen semanal. d) Solo en el panel. | a | **d** (d-16): sin correo; solo en la tarjeta de uso. Los correos del 80 % y el 100 % se mantienen. Consecuencia en rg-11. |
| q-6 | ¿Qué cuenta en el mes del lanzamiento? | a) Solo desde el lanzamiento. b) Todo el mes. | a | **b** (d-17, cambiada el 29 oct 2026). |
| q-7 | ¿Se autoriza cambiar `entitlements.ts`? | Sí o no. | Sí, en el dominio | **Sí, en el dominio** (d-18): `entitlements.ts` y `plan.ts`. El plugin, solo si el engineer demuestra que hace falta, y volviendo a preguntar al humano. |

---

## 15. Criterios de aceptación de alto nivel

Para que el planner los baje a CA numerados. **[e2e]** sugiere qué cubre el e2e-tester; el resto se
verifica con revisión, peticiones o navegador. Salvo que se diga otra cosa: cuenta Gratis (tope 10),
pantallas a 375 px y a 1280 px.

- **A-1 [e2e]** En una cuenta Gratis, las reservas 1 a 10 del mes se aceptan y la 11 muestra el
  mensaje del tope. Se suman las reservas de todos los médicos de la cuenta y, si tiene varias, de
  todas sus sedes. Los topes de Consultorio (150), Clínica (600) y Red (sin tope) salen de la
  definición de los planes (revisión).
- **A-2 [e2e]** Una cita reservada este mes para una fecha del mes siguiente cuenta en este mes (d-12).
- **A-3** El límite del mes sigue la hora de Lima, con el navegador y el servidor en otro huso.
- **A-4 [e2e]** Cancelar desde el link no baja el contador ni reabre el link (d-13). Reprogramar,
  también a otro mes o a otro médico, no lo sube. Cuando exista «no asistió», esas citas siguen
  contando.
- **A-5 [e2e]** Con el tope alcanzado, abrir el link muestra la cabecera de la sede y el mensaje, sin
  pasos, en sus tres variantes de contacto. Ningún texto menciona el plan, el tope, cantidades, la
  fecha de reapertura, una mejora de plan ni un error.
- **A-6 [e2e]** Si el tope se alcanza mientras el paciente llena el formulario, al confirmar ve el
  mismo mensaje: no se crea la cita, no sale ningún correo y no queda guardado nada de lo que escribió.
- **A-7 [e2e]** Con dos reservas simultáneas por la última cita del mes, se crea exactamente una.
- **A-8 [e2e]** Con el tope alcanzado, una reserva enviada al servidor sin pasar por la página se
  rechaza sin crear nada.
- **A-9 [e2e]** En una cuenta de pago con el tope alcanzado, las citas existentes siguen en la agenda,
  y el paciente con link cancela y reprograma a cualquier fecha.
- **A-10 [e2e]** El ADMIN ve la tarjeta de uso en sus tres estados, con los textos del mockup; la
  mejora de plan nombra el tope del plan siguiente (150 o 600). Una cuenta Red no la ve.
- **A-11 [e2e]** Con el tope alcanzado, el estado del link en Inicio no dice para ningún rol que el
  link recibe reservas.
- **A-12 [e2e]** DOCTOR y USER no ven la tarjeta, ni números, ni el «Pedir el plan» del tope. Con el
  tope alcanzado ven el estado del link y el texto sobre el administrador. El aviso de plan de las
  métricas sigue como hoy, también para ellos (aclarado el 26 de octubre de 2026, DP-3 del plan).
- **A-13 [e2e]** El dueño recibe el aviso del 80 % y el del 100 % una vez por mes y por tope. Las
  reservas perdidas no envían ningún correo (d-16). Ningún correo lleva datos de pacientes, y los ADMIN
  que no son dueños no los reciben.
- **A-14 [e2e]** Recargar el link cerrado no suma más de una reserva perdida por día y navegador, y la
  visita de alguien con sesión del consultorio no suma. El rechazo al confirmar sí suma. El número se
  ve en la tarjeta de uso del ADMIN y en ningún otro lugar.
- **A-15** Las vistas previas al compartir el link no suman reservas perdidas.
- **A-16 [e2e]** Contacto (d-15): solo un ADMIN lo agrega, lo cambia o lo borra, y empieza vacío,
  también en las sedes que ya tenían teléfono. Un celular muestra WhatsApp y llamar; un fijo, solo
  llamar. Un número inválido da un error en español. El contacto solo aparece en la página del link
  cerrado.
- **A-17 [e2e]** Subir de plan con el link cerrado lo abre en la siguiente visita, si las citas del mes
  quedan bajo el tope nuevo. Bajar de plan o cancelar la suscripción lo cierra si ya llegan al tope
  nuevo. Las citas existentes no cambian.
- **A-18** El día 1 a las 00:00 de Lima el link se abre solo y la tarjeta empieza en «0 de {tope}».
- **A-19** En el mes del lanzamiento cuentan todas las citas creadas en el mes, también las anteriores al despliegue (d-17).
- **A-20** De una reserva perdida solo quedan la cuenta, la sede y el momento; los registros del
  sistema no guardan datos del paciente, y la marca contra el doble conteo no lleva identificadores.
  Lo verifica el security-reviewer.
- **A-21** La definición de los planes ya no incluye médicos, e invitar médicos no tiene límite en
  ningún plan. `api/src/plugins/entitlements.ts` no cambia, salvo que el humano lo autorice (d-18).
- **A-22** Los documentos de la sección 12 reflejan las decisiones tomadas.

---

## Fuentes

- Doctocliq, planes y precios (consultado el 25 de octubre de 2026):
  https://www.doctocliq.com/planes-y-precios
- AgendaPro Perú, planes (consultado el 25 de octubre de 2026): https://agendapro.com/pe/planes
- Del repositorio: `docs/PRODUCT.md`; `docs/features/autogestion-paciente/prd.html`;
  `docs/features/primer-uso/plan.md` (worktree `primer-uso`, PR #126); `docs/capacidades.md`;
  `web/src/app/terminos-y-condiciones/page.tsx`; `web/src/components/marketing/pricing.tsx`;
  `api/src/domain/entities/subscription/plan.ts` y `entitlements.ts`;
  `api/src/domain/entities/availability/entity.ts` (horarios de 30 minutos, 366 días adelante);
  `platform/src/components/booking/datetime-step.tsx` (52 semanas);
  `platform/src/components/common/plan-feature-notice.tsx`.
