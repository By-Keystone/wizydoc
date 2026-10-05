# WizyDoc — Mapa de capacidades

Inventario detallado de lo que hace el sistema, según el código (octubre
2026). Es la plantilla para comparar con la competencia fila por fila (ver
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
| Paciente reconocido por su documento (no se duplica) | Hoy | Reutiliza la ficha y refresca contacto |
| Correo de confirmación | Hoy | Vía SES |
| Paciente cancela o reprograma solo | Próximo | Hoy el correo le pide llamar a la clínica |
| Paciente confirma asistencia | Próximo | |
| Recordatorios por correo | Próximo | |
| Recordatorios automáticos por WhatsApp | Próximo | Cupo mensual incluido desde Consultorio; número de WizyDoc que no recibe respuestas |
| SMS, chat manual por WhatsApp y compra de mensajes | Fuera | Ver "Comunicación con el paciente" en PRODUCT.md |
| Pago de la cita por el paciente | Fuera | |
| Teleconsulta | Fuera | |
| Perfil público del médico / directorio o marketplace | Fuera | La información del paciente es de la clínica |

## Agenda (lado del médico y la clínica)
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Disponibilidad semanal por médico | Hoy | Bloques por día de la semana |
| Agenda del día | Hoy | El doctor ve sólo sus citas |
| Vista de semana o de días futuros | Próximo | |
| Estados de cita (atendida por defecto, no asistió, cancelada, cancelación tardía) | Próximo | Hoy toda cita queda en `PENDING` |
| Registrar una cita tomada por teléfono | Próximo | |
| Bloqueos puntuales (vacaciones, feriados) | Futuro | |

## Paciente y registro clínico
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Listado de pacientes | Hoy | |
| Ficha: identificación, contacto, aseguradora | Hoy | Planes de pago |
| Ficha: alergias, antecedentes, medicación, grupo sanguíneo | Hoy | Distingue "nadie preguntó" de "no tiene alergias" |
| Historial de citas con métricas del paciente | Parcial | Las métricas dependen de los estados de cita, que aún no existen |
| Permisos por rol sobre la ficha | Hoy | ADMIN y DOCTOR editan todo; USER sólo contacto |
| Datos del paciente aislados por cuenta, no compartidos con otras clínicas | Hoy | Paciente único por cuenta y documento |
| Evidencia de la consulta (notas por cita) | Futuro | No se edita ni se borra, se registra quién la lee, recepción no la ve |
| Plantillas por especialidad | Futuro | |
| Diagnósticos codificados (CIE-10), recetas, adjuntos | Futuro | |
| Integración con RENHICE u otros sistemas del Estado | Fuera | |

## Equipo y organización
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Varias sedes por cuenta | Hoy | Según plan |
| Varios médicos con especialidades | Hoy | Según plan |
| Especialidades por organización | Hoy | Nombre único dentro de cada organización; el booking de una sede muestra sólo las de su organización |
| Roles: administrador, doctor, usuario (recepción) | Hoy | |
| Crear organizaciones y sedes | Hoy | Organización: un ADMIN de una organización (la primera, el dueño de la cuenta). Sede: un ADMIN de su organización |
| Invitaciones al equipo por correo | Hoy | Sólo un ADMIN del recurso al que invita. El invitado define su contraseña desde el link; si ya tiene una, sólo acepta |
| Métricas por sede | Hoy | Plan Clínica |
| Exportación de datos | Parcial | Está en el plan Red, sin implementar |

## Planes y cobro
| Capacidad | Estado | Nota |
| --- | --- | --- |
| Plan gratis sin tarjeta | Hoy | Único plan que ofrece el onboarding durante la beta |
| Tope de 10 pacientes en Gratis | Próximo | Ver PRODUCT.md |
| Límites de médicos y sedes por plan | Hoy | |
| Función fuera del plan muestra la mejora de plan | Hoy | Responde 402, no un error |
| Suscripción mensual con Culqi en soles | Parcial | Congelada en la beta: el api rechaza planes de pago al registrarse y no llama a Culqi; los planes de pago se asignan a mano |
| Médicos y sedes adicionales (add-ons) | Parcial | Médico S/ 25 (Consultorio) o S/ 20 (Clínica), sede S/ 40: se anuncian y el modelo los contempla, pero no se cobran |

## Desajustes entre la landing y el código
- "Cada reserva se confirma sola": la cita se crea en `PENDING`; sólo se envía
  el correo.
- Add-ons de médico y sede: anunciados, no se cobran.
- "Exportación de datos" (plan Red): ningún endpoint la usa.
- Los testimonios son de ejemplo.
