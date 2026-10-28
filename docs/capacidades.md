# WizyDoc — Mapa de capacidades

Inventario detallado de lo que hace el sistema, según el código revisado el 18
de octubre de 2026. Es la plantilla para comparar con la competencia fila por fila (ver
`docs/research/`). La visión y la estrategia están en `docs/PRODUCT.md`.

Estados: **Hoy** = existe en el código · **Parcial** = existe con
limitaciones · **Próximo** = siguiente en el roadmap · **Futuro** = parte de
la visión, sin fecha · **Fuera** = fuera de alcance por ahora.

## Reserva del paciente (booking público)
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Link público de reserva por sede, sin cuenta | Hoy | `/clinic/[clinicId]/create-appointment` |
| Flujo especialidad → médico → fecha y horario → datos → confirmación | Hoy | Mobile-first |
| Sólo horarios libres (disponibilidad menos citas tomadas) | Hoy | Calculado en el servidor |
| Sin doble reserva del mismo horario | Hoy | Restricción única en base de datos |
| Paciente reconocido por su documento (no se duplica) | Hoy | Reutiliza la ficha existente sin modificarla: el booking es anónimo |
| Correo de confirmación | Hoy | Vía SES. En planes de pago trae el botón "Gestionar mi cita"; en Gratis sale sin el link |
| Paciente cancela su cita desde el link, con motivo | Hoy | Planes de pago. Hasta 12 h antes; motivo obligatorio de una lista fija, sin texto libre, que llega al médico por correo. A menos de 12 h el link no permite ningún cambio: no hay cancelación tardía |
| Paciente reprograma su cita desde el link | Hoy | Planes de pago. Una sola vez, hasta 12 h antes y a horarios que queden a 12 h o más. Mismo médico; si no tiene horarios, otro de la misma sede y especialidad. Correo al paciente y al médico |
| Motivo de consulta en la reserva, que llega a la ficha | Futuro | En "Después" de PRODUCT.md |
| Paciente confirma asistencia | Futuro | Sólo si los clientes lo piden: salió de las prioridades el 17 de octubre de 2026. Si vuelve, agrega el estado "confirmada" |
| Recordatorio automático por correo 24 h antes | Futuro | Sólo si los clientes lo piden (17 de octubre de 2026). Hoy el paciente sólo recibe los correos de reserva, cancelación y reprogramación |
| Recordatorios automáticos por WhatsApp | Futuro | Sólo si los clientes lo piden (17 de octubre de 2026). Si se hacen: cupo mensual desde Consultorio y número de WizyDoc que no recibe respuestas |
| SMS, chat manual por WhatsApp y compra de mensajes | Fuera | Ver "Comunicación con el paciente" en PRODUCT.md |
| Pago de la cita por el paciente | Fuera | |
| Teleconsulta | Fuera | |
| Perfil público del médico / directorio o marketplace | Fuera | La información del paciente es de la clínica |

## Agenda (lado del médico y la clínica)
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Disponibilidad semanal por médico | Hoy | Bloques por día de la semana |
| Agenda del día | Hoy | El doctor ve sólo sus citas; el administrador y recepción ven todas las de la sede |
| "Mi día": agenda del médico centrada en su siguiente cita | Próximo | Resumen de la ficha del paciente en planes de pago. Va después de "El administrador también atiende" |
| Vista de semana o de días futuros | Próximo | |
| Estados de cita (atendida por defecto, no asistió, cancelada) | Parcial | Sólo existe la cancelación por el paciente desde el link; el resto de citas queda en `PENDING` |
| Etiquetas "Cancelada por el paciente" y "Reprogramada por el paciente" en el panel | Próximo | Hoy el panel muestra "Cancelada" sin decir quién canceló, y nada si se reprogramó |
| Personal cancela o mueve citas desde el panel | Futuro | Previsto en la política de cancelación de PRODUCT.md, sin prioridad |
| Registrar una cita tomada por teléfono | Próximo | |
| Bloqueos puntuales (vacaciones, feriados) | Futuro | |

## Paciente y registro clínico
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Listado de pacientes | Parcial | Sólo en planes de pago: el api cierra todo el módulo de pacientes con `PATIENT_RECORD`. Llega a Gratis con los datos básicos |
| Ficha: datos básicos (nombre, apellido, documento, teléfono, correo, sexo, fecha de nacimiento, contacto de emergencia, aseguradora) en todos los planes | Próximo | Hoy existen y se editan, pero sólo en planes de pago: toda la ficha es de pago |
| Ficha: datos de salud (alergias, antecedentes, medicación, grupo sanguíneo) | Hoy | Desde Consultorio. Distingue "nadie preguntó" de "no tiene alergias" |
| Historial de citas con métricas del paciente | Parcial | Desde Consultorio. Las métricas dependen de los estados atendida y no asistió, que aún no se registran |
| Permisos por rol sobre la ficha | Hoy | ADMIN y DOCTOR editan todo; USER (recepción) edita identificación y contacto, no datos de salud |
| Importar pacientes desde Excel | Futuro | Desde Consultorio. En "Después" de PRODUCT.md |
| Exportar pacientes a CSV | Futuro | Desde Consultorio. El código sólo tiene el feature `DATA_EXPORT` en el plan Red; ningún endpoint lo usa |
| Datos del paciente aislados por cuenta, no compartidos con otras clínicas | Hoy | Paciente único por cuenta y documento |
| Evidencia de la consulta (notas por cita) | Futuro | No se edita ni se borra, se registra quién la lee, recepción no la ve |
| Plantillas por especialidad | Futuro | |
| Diagnósticos codificados (CIE-10), recetas, adjuntos | Futuro | |
| Integración con RENHICE u otros sistemas del Estado | Fuera | |

## Equipo y organización
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Varias sedes por cuenta | Hoy | Según plan |
| Varios médicos con especialidades | Hoy | Sin límite en ningún plan, ni en el producto ni en el código |
| El administrador también atiende (especialidad, disponibilidad y aparece en el booking) | Hoy | Desde #110: todo administrador de la organización queda como médico de cada sede nueva; con el primer uso, el dueño ya atiende desde el onboarding |
| "Mi perfil": datos personales, cambio de contraseña y "Dónde atiendes" en solo lectura | Hoy | Una página por persona, desde el menú del avatar |
| Tratamiento del médico (Dr./Dra.) | Hoy | Se elige en "Mi perfil" si se tiene perfil de médico; el api arma el nombre que muestran el booking y el panel. Sin tratamiento, sólo el nombre completo |
| Especialidades por organización | Hoy | Nombre único dentro de cada organización; el booking de una sede muestra sólo las de su organización |
| Roles: administrador, doctor, usuario (recepción) | Hoy | |
| Crear organizaciones y sedes | Hoy | Organización: un ADMIN de una organización (la primera, el dueño de la cuenta). Sede: un ADMIN de su organización |
| Invitaciones al equipo por correo | Hoy | Sólo un ADMIN del recurso al que invita. El invitado define su contraseña desde el link; si ya tiene una, sólo acepta |
| Métricas por sede | Hoy | Desde Clínica |

## Planes y cobro
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Plan gratis sin tarjeta | Hoy | Único plan que ofrece el onboarding durante la beta |
| Tope de citas al mes por plan (Gratis 10, Consultorio 150, Clínica 600; Red sin tope) | Hoy | También en la beta. Cuenta cada cita reservada en el booking en el mes calendario de Lima en que se reserva; no se descuenta al cancelar ni en "no asistió", y reprogramar no cuenta otra vez. Es de la cuenta: suma sedes y médicos. Al llegar al tope el booking de todas las sedes muestra "Este consultorio no está recibiendo reservas en línea por ahora", con el "WhatsApp o teléfono para pacientes" de la sede si existe. Lo ya reservado y la autogestión siguen igual. El administrador ve en Inicio el uso del mes y las reservas perdidas (sólo en el panel); el dueño recibe correos al 80 % y al 100 %. Ver `docs/features/tope-citas-mes/prd.md` |
| Límite por sedes, sin límite de médicos ni de pacientes | Hoy | Las sedes se limitan (1, 1 y 3); ningún plan limita médicos ni pacientes |
| Función fuera del plan muestra la mejora de plan | Hoy | Responde 402, no un error |
| Al bajar a Gratis se pierde todo lo de pago, de inmediato | Parcial | La ficha y las métricas responden 402 y las citas nuevas salen sin link, pero los links de autogestión ya enviados siguen funcionando: el api no revisa el plan al usarlos |
| Suscripción mensual con Culqi en soles | Parcial | Congelada en la beta: el api rechaza planes de pago al registrarse y no llama a Culqi; los planes de pago se asignan a mano |
| Sede adicional (S/ 40 en Clínica) | Parcial | `extraClinics` amplía el tope de sedes si se asigna a mano, pero no se cobra, y no suma citas. Los médicos adicionales ya no existen: `extraDoctors` queda en la base, pero no suma nada |

## Desajustes entre la landing y el código
- "Cada reserva se confirma sola" y "confirmar asistencias": la cita se crea en
  `PENDING` y sólo se envía el correo; el paciente no confirma asistencia.
- Médicos: ni el producto ni el código los limitan. La landing publica los topes
  de citas (10, 150, 600 y sin tope en Red).
- Sede adicional (plan Clínica): anunciada, no se cobra. El médico adicional ya no se anuncia.
- "Exportación de datos" (plan Red): ningún endpoint la usa.
- La autogestión del paciente (cancelar y reprogramar por link) ya existe en los
  planes de pago y la landing no la menciona.
- Los testimonios son de ejemplo (nombres y clínicas de marcador).

## Deriva técnica
- `schema.prisma` define `AddOn` y `AddOnType` sin migración que cree la tabla
  `add_on`, y ningún código los usa.
