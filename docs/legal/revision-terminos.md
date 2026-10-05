# Revisión de los Términos y condiciones

> **Borrador — pendiente de revisión por abogado.**
> Revisión preparada el 5 de octubre de 2026 por el agente legal. No es
> asesoría legal definitiva.

Documento revisado: `web/src/app/terminos-y-condiciones/page.tsx` (rama
`main`, idéntico a `origin/main`, "Última actualización: 26 de septiembre de
2026"). Se contrasta con el código de `api/`, `platform/` y `web/` y con
`docs/PRODUCT.md`, `docs/capacidades.md` y
`docs/features/beta-free-plan-only/plan.md`.

Leyenda de cada hallazgo:

- **[Ley]** obligatorio por ley.
- **[Culqi]** exigido por Culqi para aprobar la web.
- **[Práctica]** buena práctica recomendada.
- `[sin verificar]`: no se leyó la fuente oficial en esta sesión.

---

## 1. Resumen

Los términos describen el producto objetivo y no el que existe hoy. Prometen
tres cosas que el código no tiene: cancelar la suscripción desde la
plataforma, que la cuenta pase sola a Gratis al vencer y reintentar los cobros
fallidos. Remiten a tres documentos que no existen: la política de privacidad,
la política de cambios y devoluciones y el Libro de Reclamaciones virtual.
Faltan los datos del titular. Además, no hay ningún paso en el que el usuario
acepte los términos: el registro de `platform` no los menciona.

En la beta sólo se ofrece el plan Gratis y el cobro con Culqi está congelado.
La sección de precios y la de cobro recurrente describen algo que hoy no
ocurre. Pero Culqi pide ver precios y un proceso de compra para aprobar la web
(ver §4). Por eso hay que decidir cómo presentar los planes de pago durante la
beta (decisión D1).

---

## 2. Promesas que el código no cumple

| # | Sección | Qué promete | Qué hace el código | Gravedad |
| --- | --- | --- | --- | --- |
| P1 | 6 | "El Usuario puede cancelar su suscripción en cualquier momento desde la plataforma" | No hay endpoint ni pantalla para cancelar. `Subscription.status` sólo se escribe al crear la cuenta. La suscripción recurrente vive en Culqi y WizyDoc no recibe webhooks (`docs/features/beta-free-plan-only/plan.md`, hallazgo 2). | Alta |
| P2 | 6 | "Al vencer, la Cuenta pasa al plan gratuito" y "no se le realizarán cobros posteriores" | Nada pasa la cuenta a Gratis. Cancelar exige darse de baja a mano en el panel de Culqi. Si alguien lo olvida, Culqi sigue cobrando. | Alta |
| P3 | 5 | "WizyDoc podrá reintentarlo y [...] suspender el acceso" | WizyDoc no se entera de los cobros rechazados, así que no reintenta ni suspende. | Media |
| P4 | 5 | Cargos por médico adicional (S/ 25 o S/ 20) y sede adicional (S/ 40) | El modelo `AddOn` existe, pero no se cobran (`docs/capacidades.md`). | Media |
| P5 | 5 | "Planes de pago" contratables y "cobro recurrente mensual automático" | En la beta el onboarding sólo debe ofrecer Gratis (plan de la feature `beta-free-plan-only`). En `main`, hoy se puede elegir Red sin pagar ni firmar contrato (hallazgo 1 de ese plan). | Alta mientras no se despliegue ese plan |
| P6 | 10 | "La información y los datos que el Usuario carga [...] siguen siendo de su titularidad" | En el plan Gratis, toda la ficha del paciente responde 402 (`api/src/routes/patient/index.ts`: `requireFeature("PATIENT_RECORD")`; `FREE.features = []` en `plan.ts`). En la beta todas las cuentas son Gratis, así que el consultorio no puede ver ni exportar los datos de sus pacientes, aunque WizyDoc los guarda desde el booking. Esto contradice `docs/PRODUCT.md`: la ficha está incluida en Gratis y "nunca se bloquea el acceso a datos ya guardados". | **Crítica** (ver R2) |
| P7 | 9 | Derechos ARCO "escribiendo a [CORREO]" | No hay forma de borrar un paciente, un usuario ni una cuenta, ni desde la app ni por API. `Patient.account` usa `onDelete: NoAction`, así que una cuenta con pacientes no se puede borrar sin un script. La supresión sólo puede hacerse a mano en la base de datos. | Alta |
| P8 | 2 | "enviar confirmaciones automáticas de cada cita" | Se cumple: se envía el correo de confirmación por SES. La cita queda `PENDING` (no hay estados), pero el texto no promete más. | — |
| P9 | 7 | Remite a una "Política de cambios y devoluciones" | No existe. `web/src/app` sólo tiene `/`, `/beta` y `/terminos-y-condiciones`. | Alta [Culqi] |
| P10 | 9 | Remite a la "Política de privacidad" | No existe. Hay un borrador en `docs/legal/politica-privacidad.md`. | Alta [Ley] |
| P11 | 14 | "ponemos a disposición nuestro Libro de Reclamaciones virtual" | No existe. Lo documenta el planner como feature. | Alta [Ley][Culqi] |
| P12 | 4 | Registro con "confirmar su correo electrónico" | Se cumple: `policy({ confirmed: true })` y `User.confirmed`. | — |

---

## 3. Lagunas legales

### 3.1 No hay aceptación de los términos

- **[Ley][Práctica]** Ni `platform/src/app/(auth)/register` ni el onboarding
  enlazan los términos ni piden aceptarlos. No queda constancia de qué
  versión aceptó cada usuario ni cuándo. Sin aceptación, las cláusulas sobre
  limitación de responsabilidad y encargo del tratamiento son difíciles de
  oponer. En la sección 3.3 se explica por qué esto importa en el encargo.
- **[Culqi]** Culqi pide que los términos digan que "el uso de esta plataforma
  implica la aceptación" (ver §4). Basta para Culqi, pero no da prueba.
- Recomendación: casilla no premarcada en el registro con enlace a los
  términos y a la política de privacidad. Guardar la versión y la fecha
  aceptadas. Es trabajo de producto: planner y engineer.

### 3.2 Cambio unilateral de los términos (sección 12)

- **[Ley]** "El uso continuado del servicio después de la entrada en vigencia
  implica su aceptación". Si el cliente es consumidor (ver §5.1), el art.
  56.1.c del Código de Protección y Defensa del Consumidor (Ley 29571)
  prohíbe "modificar, sin el consentimiento expreso del consumidor, las
  condiciones y términos" del contrato. También dice que no se puede presumir
  el silencio como aceptación. Fuente verificada: edición Indecopi 2023,
  https://cdn.www.gob.pe/uploads/document/file/4265044/Co%CC%81digo%20de%20Proteccio%CC%81n%20y%20Defensa%20del%20Consumidor%20-%202023%20(1).pdf.pdf
- **[Ley]** Si WizyDoc es encargado del tratamiento, el art. 30.1 del D.S.
  016-2024-JUS le obliga a avisar al responsable de los cambios en sus
  políticas de privacidad o condiciones "para obtener el consentimiento si ello
  significara incrementar sus facultades de tratamiento". Fuente verificada:
  https://cdn.www.gob.pe/uploads/document/file/7568330/6426760-decreto-supremo-n-016-2024-jus-reglamento-de-la-ley-n-29733-ley-de-proteccion-de-datos-personales-publicado-nov-2024.pdf
- Recomendación: avisar por correo con anticipación (proponer 30 días) y dar
  derecho a terminar sin penalidad. Si el cambio amplía el tratamiento de
  datos, pedir aceptación expresa.

### 3.3 El encargo del tratamiento está incompleto (sección 9)

La sección 9 acierta en lo esencial: el consultorio es titular del banco de
datos y WizyDoc es encargado. Le falta lo que la ley exige al encargo:

- **[Ley]** El art. 30 de la Ley 29733 prohíbe usar los datos para un fin
  distinto del contrato. También prohíbe transferirlos, "ni aun para su
  conservación". Al terminar el servicio, los datos deben suprimirse. Fuente
  verificada: https://www.smv.gob.pe/Uploads/Ley_29733_vigente_2025.pdf
- **[Ley]** Según el art. 31.2 del reglamento, el encargado puede conservar los
  datos como máximo dos años desde el último encargo, y sólo con autorización.
  "La conservación indeterminada [...] está prohibida." Los términos no fijan
  ningún plazo.
- **[Ley]** El art. 32.2 del reglamento exige autorización previa del
  responsable para subcontratar, y la da por concedida si figura en el
  instrumento del encargo. Los términos no nombran a los subencargados: AWS
  (SES), Railway (hosting y base de datos) y Culqi (pagos de la cuenta, no de
  pacientes).
- **[Ley]** El art. 29 del reglamento (medios tecnológicos tercerizados) pide
  informar las subcontrataciones y garantizar y evidenciar la destrucción de
  los datos al terminar la prestación. El art. 30.4 pide suprimirlos "una vez
  que [...] este último los haya podido recuperar". Hoy el consultorio no puede
  recuperarlos (P6, P7).
- **[Ley]** El art. 36 del reglamento obliga al encargado a informar "de forma
  inmediata" al responsable de un incidente de seguridad. El art. 34 obliga al
  responsable a notificar a la Autoridad en 48 horas cuando hay datos
  sensibles. Los términos no lo recogen.
- **[Ley]** El art. 31.1 del reglamento prohíbe al encargado transferir los
  datos a terceros sin autorización del responsable.
- Recomendación: un anexo "Acuerdo de encargo de tratamiento" que forme parte
  de los términos. Debe incluir finalidad, tipos de datos, subencargados,
  medidas de seguridad, aviso de incidentes, devolución y supresión al
  terminar, y plazo.

### 3.4 La declaración de consentimiento del consultorio (sección 8)

- **[Ley]** Los datos de salud son sensibles (Ley 29733, art. 2.5). Su
  tratamiento exige consentimiento por escrito (art. 13.6 de la Ley; art. 8
  del reglamento: "firma manuscrita, digital, electrónica o cualquier otra
  modalidad que garantice la voluntad"). La carga de la prueba recae en el
  titular del banco (art. 9 del reglamento). La sección 8 traslada todo al
  consultorio. Es correcto, pero el producto no le da cómo cumplirlo:
  - El formulario público de reserva
    (`platform/src/app/clinic/[clinicId]/create-appointment/steps/patient-step.tsx`)
    pide nombre, documento, fecha de nacimiento, teléfono y correo. No muestra
    ningún aviso de privacidad, no enlaza a ninguna política y no pide
    consentimiento. El art. 6.1 del reglamento exige informar antes de
    recopilar: identidad del titular del banco, finalidad, destinatarios,
    transferencias, plazo de conservación y cómo ejercer los derechos.
  - La especialidad elegida al reservar (p. ej. psiquiatría u oncología)
    puede revelar información de salud. `[sin verificar]` si la Autoridad la
    califica como dato sensible por sí sola. Que lo valore el abogado.
  - La ficha (alergias, antecedentes, medicación, grupo sanguíneo) la llena el
    personal del consultorio. Ahí podría aplicar la excepción del art. 14.6 de
    la Ley (salud, "en circunstancia de riesgo [...] por profesionales en
    ciencias de la salud"). Su alcance es limitado; que lo valore el abogado.
- Recomendación (producto): un aviso breve en el paso "Tus datos" del booking,
  con una casilla no premarcada y el nombre del consultorio como titular. El
  texto propuesto está en `politica-privacidad.md`, Parte B.

### 3.5 Menores de edad

- **[Ley]** El booking acepta cualquier fecha de nacimiento. Para menores de
  14 años, el tratamiento exige el consentimiento de quien ejerce la patria
  potestad o tutela. Los mayores de 14 y menores de 18 pueden consentir según
  su capacidad (reglamento, art. 22). Los términos no dicen nada sobre quién
  reserva por un menor.
- Recomendación: que el aviso del booking diga que, si la cita es para un
  menor, la reserva la hace su padre, madre o tutor.

### 3.6 Limitación de responsabilidad (sección 11)

- **[Ley]** Si el cliente es consumidor, son cláusulas abusivas de ineficacia
  absoluta las que "excluyan o limiten la responsabilidad del proveedor [...]
  por dolo o culpa" (Ley 29571, art. 50.a). También las que faculten al
  proveedor a "suspender o resolver unilateralmente un contrato" (art. 50.b).
  Esto afecta a la suspensión por falta de pago de la sección 5. La redacción
  actual no excluye dolo ni culpa de forma expresa. Conviene decir que la
  limitación no alcanza al dolo ni a la culpa inexcusable. `[sin verificar]`
  el art. 1328 del Código Civil.
- **[Práctica]** Falta tratar la pérdida de datos. Un consultorio esperará
  saber si hay copias de respaldo y con qué frecuencia. `[sin verificar]` qué
  respaldo tiene configurado Railway para Postgres.

### 3.7 Suspensión y terminación por parte de WizyDoc

- **[Ley]** No hay cláusula de terminación por parte de WizyDoc, ni preaviso,
  ni qué pasa con los datos al terminar. El art. 50.c de la Ley 29571
  considera abusivo resolver "sin comunicación previa" o poner fin a un
  contrato de duración indeterminada "sin un plazo de antelación razonable".
- Recomendación: un preaviso (proponer 30 días), un periodo para descargar los
  datos y luego la supresión según el acuerdo de encargo.

### 3.8 Baja por el mismo medio

- **[Ley]** El art. 56.1.e de la Ley 29571 prohíbe limitar el derecho a
  desvincularse "empleando los mismos mecanismos de forma, lugar y medios
  utilizados en la celebración de los contratos". El alta es en línea. Si el
  cliente es consumidor, la baja también debe poder hacerse en línea. Hoy no
  existe (P1).

### 3.9 Ley aplicable y conflictos (sección 13)

- **[Culqi]** Culqi pide mencionar "conciliación, Indecopi o instancias
  judiciales correspondientes". El texto actual menciona tribunales e
  Indecopi, pero no la conciliación.
- **[Práctica]** Someterse a los jueces del Cercado de Lima frente a un
  consumidor de provincia puede leerse como una limitación del debido proceso
  (art. 50.f de la Ley 29571). Que lo valore el abogado.

### 3.10 Otros

- **Definición de Usuario (sección 3):** dice "persona [...] que contrata un
  plan". En el código, "usuario" también es el doctor o la recepcionista
  invitados (`UserResourceMembership`), que aceptan una invitación y no
  contratan nada. Los términos deben aplicarse también a ellos, y la
  invitación debería enlazarlos.
- **Paciente:** los términos no le aplican, porque no tiene cuenta. Correcto,
  pero el pie de la página de booking debería enlazar el aviso de privacidad.
- **Requisitos de edad para registrarse:** Culqi los pide. Proponer: mayor de
  edad y profesional de la salud o representante del consultorio.
- **Impuestos:** no se dice si los precios incluyen IGV. Lo exigen Culqi y el
  deber de información de precios. `[sin verificar]` art. 5 del D.S.
  006-2013-PCM sobre precios con impuestos.
- **Medios de pago:** no se mencionan (tarjeta, vía Culqi). Culqi lo exige.
- **Periodo de prueba:** si en el futuro hay prueba gratuita de un plan de
  pago, Culqi pide detallar la renovación y los avisos. Hoy no aplica.

---

## 4. Requisitos de Culqi

Fuentes verificadas en esta sesión (Centro de ayuda de Culqi, artículos
actualizados en septiembre de 2025):

- Requisitos de la web:
  https://ayuda.culqi.com/portal/es/kb/articles/cuales-son-los-requisitos-para-que-la-web-o-app-de-mi-comercio-no-sea-observado-al-momento-de-integrar-la-pasarela
- Términos y condiciones:
  https://ayuda.culqi.com/portal/es/kb/articles/cuales-son-los-requisitos-legales-de-los-terminos-y-condiciones-alojados-en-mi-web-o-app
- Cambios y devoluciones:
  https://ayuda.culqi.com/portal/es/kb/articles/cuales-son-los-requisitos-legales-de-las-politicas-de-cambios-y-o-devoluciones-alojados-en-mi-web-o-app
- Libro de Reclamaciones:
  https://ayuda.culqi.com/portal/es/kb/articles/que-datos-debe-incluir-el-libro-de-reclamaciones-alojado-en-mi-web-o-app

| Requisito de Culqi | Estado en wizydoc.app | Qué falta |
| --- | --- | --- |
| Decir con claridad qué productos o servicios se ofrecen | Cumple (landing y sección 2) | — |
| Datos de contacto visibles: número, correo, dirección | **No cumple**: `[TELÉFONO]`, `[CORREO ELECTRÓNICO]` y `[DOMICILIO FISCAL]` son marcadores, y no están en el pie de la landing (`web/src/components/marketing/footer.tsx` sólo tiene LinkedIn e Instagram) | Datos reales, en los términos y en el pie |
| Íconos de redes que lleven a las cuentas reales | Cumple a primera vista (LinkedIn, Instagram) | Comprobar que los enlaces funcionan |
| Términos con razón social, RUC, dirección, teléfono y correo | **No cumple** (marcadores) | Datos reales |
| Términos: cláusula "el uso implica la aceptación" y derecho a actualizar avisando | Parcial (sección 12) | Ver §3.2 sobre aceptación expresa |
| Términos: registro con datos verídicos, requisitos (p. ej. mayoría de edad), confidencialidad de la cuenta | Parcial: falta el requisito de edad o condición | Añadir |
| Términos: precios en moneda, medios de pago, impuestos, seguridad del pago | Parcial: soles sí; medios de pago e IGV no | Añadir |
| Términos: proceso de compra y motivos de cancelación por el comercio | No | Describir el alta del plan y cuándo WizyDoc puede rechazarla o suspenderla |
| Términos: envíos y entrega | No aplica (servicio digital) | Decir que el acceso es inmediato tras el alta |
| Términos: datos personales (Ley 29733), finalidad y cómo ejercer los derechos | Parcial (sección 9) | Enlazar la política de privacidad |
| Términos: contacto **con horario de atención** | **No**: falta el horario | Añadir horario |
| Política de cambios y devoluciones publicada | **No existe** | Redactar. Para un SaaS: cambio de plan, prorrateo o no, reembolsos por cobro indebido o duplicado y plazo de devolución. Pendiente de decisión del humano (D3) |
| Libro de Reclamaciones integrado en la web, sin formularios ni enlaces externos (no Google Forms ni Drive) | **No existe** | Feature del planner |
| Al menos 5 productos con foto, descripción y precio, o un mínimo de servicios según el rubro | Planes con precio en `pricing.tsx`; Culqi dice que el mínimo "puede variar" para servicios | Riesgo de observación si en la beta se ocultan los precios (D1) |
| Carrito o botón "Comprar"; usuario y contraseña de prueba si el flujo pide login | Hoy los botones de precios dan 404 (`beta-free-plan-only/plan.md`, hallazgo 3). Con el cobro congelado no hay flujo de compra | Decidir con Culqi cómo revisan un SaaS en beta (D1) |
| SSL en todas las URL | `[sin verificar]` | Comprobar wizydoc.app y la app |

**Conclusión sobre Culqi:** con los datos del titular, la página quedaría
completa sólo en identificación. Para que Culqi no observe la web faltan
además la política de cambios y devoluciones, el Libro de Reclamaciones
integrado, el horario de atención y un flujo de compra demostrable. Mientras
el cobro esté congelado, este último no existe. Recomiendo preguntar a Culqi
si aceptan revisar la web con el flujo de pago en un entorno de prueba.

---

## 5. ¿Es obligatorio el Libro de Reclamaciones virtual para WizyDoc?

**Respuesta corta: sí en la práctica. Culqi lo exige sin excepciones, y es
muy probable que la ley también lo exija, porque parte de los clientes de
WizyDoc serán consumidores para el Código.**

### 5.1 Por ley

- **Art. 150 de la Ley 29571:** "Los establecimientos comerciales deben contar
  con un libro de reclamaciones, en forma física o virtual". El art. 151 exige
  un aviso visible de que existe. El art. 152 obliga a responder en el plazo
  del art. 24.1, que es de **quince (15) días hábiles improrrogables**. Fuente
  verificada: edición Indecopi 2023, URL en §3.2.
- **D.S. 011-2011-PCM (Reglamento del Libro de Reclamaciones):**
  - Art. 1: se aplica a "proveedores que desarrollen sus actividades
    económicas en establecimientos comerciales abiertos al público".
  - Art. 3.2: define el establecimiento como "inmueble, parte del mismo o una
    instalación o construcción" identificada con RUC.
  - Art. 4: obliga a quien, además del establecimiento, vende por medios
    virtuales a tener también un libro virtual "en el mismo medio virtual
    empleado".
  - Fuente verificada: texto en
    https://www.inei.gob.pe/media/libro_reclamaciones/DS011_2011_PCM.pdf;
    ficha oficial en
    https://www.gob.pe/institucion/presidencia/normas-legales/541080-011-2011-pcm.
    La copia leída es anterior a 2022: su art. 6 aún dice 30 días calendario.
    El D.S. 101-2022-PCM lo cambió a 15 días hábiles (nota de Indecopi del
    16/08/2022, verificada:
    https://www.gob.pe/institucion/indecopi/noticias/641594-modifican-reglamento-del-libro-de-reclamaciones-para-que-proveedores-atiendan-reclamos-y-quejas-de-clientes-en-15-dias-habiles;
    texto del decreto: https://www.gob.pe/institucion/pcm/normas-legales/3346742-101-2022-pcm
    `[sin verificar]`).
  - `[sin verificar]` si el texto vigente, tras las modificaciones de 2014 y
    2022, obliga expresamente a un proveedor **sólo digital**, sin local
    abierto al público. La práctica de Indecopi y de las pasarelas es exigirlo.
    El abogado debe confirmarlo con el texto consolidado.
- **¿Son consumidores los clientes de WizyDoc?** El art. IV.1 de la Ley 29571
  (verificado) da tres reglas:
  - 1.1: es consumidor quien actúa "en un ámbito ajeno a una actividad
    empresarial o profesional". Un médico que contrata su agenda actúa en su
    ámbito profesional, así que en principio **no** lo es.
  - 1.2: sí lo son "los microempresarios que evidencien una situación de
    asimetría informativa con el proveedor respecto de aquellos productos o
    servicios que no formen parte del giro propio del negocio". El cliente
    objetivo es un médico independiente, típicamente una persona natural con
    RUC 10 o una microempresa. Su giro es la atención médica, no el software.
    Hay argumentos fuertes para que encaje aquí. La interpretación de "giro
    propio" como actividad imprescindible del negocio viene de resoluciones de
    la Comisión de Protección al Consumidor, citadas por fuentes secundarias
    `[sin verificar]`.
  - 1.3: "en caso de duda [...] se califica como consumidor a quien lo
    adquiere, usa o disfruta".
  - Por tanto, WizyDoc no puede contar con que todos sus clientes son
    empresas, y debe tratarse como proveedor frente a consumidores. Eso arrastra
    también §3.2, §3.6, §3.7 y §3.8.
- **¿Y en la beta, sin cobro?** El art. IV.1.1 incluye a quien "utiliza o
  disfruta", no sólo a quien paga. `[sin verificar]` si Indecopi exige el libro
  por un servicio gratuito. Recomiendo tenerlo igual: lo pide Culqi y cuesta
  poco.
- **Sanción por no tenerlo:** Culqi habla de multas de hasta 3 UIT. `[sin
  verificar]` en el Código: hay que confirmarlo con su art. 110 y la tabla de
  graduación de Indecopi.

### 5.2 Por Culqi

**Sí, lo exige, y sin excepción por modelo de negocio:** "Debe tener el Libro
de Reclamaciones integrado en la web/app, cumpliendo con los lineamientos de
INDECOPI. Además, no puede depender de formularios, enlaces ni archivos
externos como Google Drive." Verificado en el artículo de requisitos de §4.
Culqi también detalla los campos mínimos: datos del proveedor, datos del
consumidor, bien contratado, monto, detalle, pedido, tipo (reclamo o queja),
respuesta y plazo.

### 5.3 Lo que debe recoger la feature (para el planner)

- Formulario propio dentro de wizydoc.app, sin servicios externos, con los
  campos de la Hoja de Reclamación (Anexo 1 del D.S. 011-2011-PCM) y la
  distinción entre reclamo y queja (art. 3.3 y 3.4).
- Código de identificación correlativo y copia al consumidor por correo
  (`[sin verificar]` artículo exacto tras la modificación de 2022).
- Aviso visible "Libro de Reclamaciones" con el plazo de respuesta (art. 151
  de la Ley 29571 y Anexo 2 del reglamento). El aviso de Culqi dice 30 días
  calendario y está desactualizado: el plazo legal hoy es de 15 días hábiles.
- Responder en 15 días hábiles por el medio que elija el consumidor (art.
  24.1).
- Conservación de las hojas: `[sin verificar]` plazo vigente (la versión 2011
  decía dos años).
- Datos que trata el libro (nombre, documento, domicilio, contacto): WizyDoc
  es el **responsable** de ese banco. Debe incluirse en la política de
  privacidad (ya está, Parte A) y en la inscripción del banco de datos.

---

## 6. Riesgos ordenados por gravedad

1. **R1 — Crítico. Se recogen datos de pacientes sin ningún aviso de
   privacidad ni consentimiento.** El booking no informa quién es el titular
   del banco, la finalidad ni los derechos (reglamento, art. 6.1; Ley 29733,
   art. 18). Eso deja sin consentimiento demostrable tanto al consultorio como
   a WizyDoc (art. 9). Los datos de salud de la ficha exigen consentimiento
   escrito (art. 13.6). Hay datos sensibles en juego.
2. **R2 — Crítico. En la beta el consultorio no puede acceder a los datos de
   sus pacientes.** Con plan Gratis, la ficha responde 402 (P6). El titular del
   banco no puede atender por sí mismo un pedido de acceso de un paciente
   (plazo de 20 días, reglamento art. 69.2), ni rectificar o suprimir (10
   días, art. 69.3). WizyDoc tendría que hacerlo a mano. Además contradice la
   sección 10 de los términos y el principio de `docs/PRODUCT.md`.
   Recomendación de producto: abrir la ficha, o al menos la lectura y la
   exportación, en Gratis.
3. **R3 — Alto. Se promete una cancelación que no existe (P1, P2).** Si hay
   alguna cuenta con suscripción viva en Culqi, puede haber cobros después de
   que el usuario pida la baja. Esos cobros serían reclamables, y el art.
   56.1.e de la Ley 29571 exige poder darse de baja en línea. Antes de publicar
   los términos, comprobar en producción y en Culqi que no queden suscripciones
   activas (consulta SQL en `beta-free-plan-only/plan.md`).
4. **R4 — Alto. No hay forma de suprimir datos.** No se puede borrar paciente,
   usuario ni cuenta (P7). No hay plazo de conservación. El encargado no puede
   conservar indefinidamente (reglamento, art. 31.2) y debe suprimir los datos
   al terminar el encargo (Ley 29733, art. 30).
5. **R5 — Alto. Faltan documentos a los que remiten los términos:** política
   de privacidad, política de cambios y devoluciones y Libro de Reclamaciones
   (P9 a P11). Los dos últimos bloquean la aprobación de Culqi.
6. **R6 — Alto. No hay registro de aceptación de los términos (§3.1).** Sin
   él, no hay prueba de que el consultorio aceptó el encargo, las
   subcontrataciones ni las limitaciones.
7. **R7 — Medio. Flujo transfronterizo de datos sin documentar.** Railway y
   AWS operan fuera del Perú `[sin verificar región real]`. El art. 21.2 del
   reglamento exige poner el flujo en conocimiento de la Dirección General e
   inscribirlo. Ver la política de privacidad, §A.6 y §B.7.
8. **R8 — Medio. Bancos de datos sin inscribir `[sin verificar]`.** WizyDoc
   como responsable de su banco de clientes, y cada consultorio por su banco de
   pacientes (art. 42 del reglamento). No hay constancia en el repo.
9. **R9 — Medio. El booking permite sobrescribir el contacto de un paciente.**
   `create-appointment.usecase.ts` hace `upsert` por tipo y número de
   documento y reemplaza teléfono y correo. Quien conozca el DNI de otra
   persona puede desviar a su correo las confirmaciones de citas de esa
   persona en ese consultorio. Afecta al principio de seguridad (Ley 29733,
   art. 9 y art. 16). Derivar al **security-reviewer**.
10. **R10 — Medio. Cláusulas que pueden ser abusivas frente a un consumidor:**
    modificación por uso continuado, suspensión unilateral y jurisdicción
    (§3.2, §3.6, §3.9).
11. **R11 — Bajo. Precios y add-ons publicados que no se cobran (P4, P5).**
    Si se mantienen visibles en la beta, decir que son referenciales y que
    WizyDoc avisará antes de activarlos.
12. **R12 — Bajo. Oficial de Datos Personales.** WizyDoc trata datos
    sensibles como actividad principal (reglamento, art. 37.1.3). Para una
    microempresa, la obligación rige 4 años después de la publicación (30 de
    noviembre de 2028), según la 1.ª Disposición Complementaria Final. Hasta
    entonces se recomienda un punto de contacto de privacidad.

---

## 7. Datos pendientes del humano

| Dato | Dónde se usa |
| --- | --- |
| `[RAZÓN SOCIAL]` | Términos §1, política de privacidad, Libro de Reclamaciones |
| `[RUC]` | Ídem |
| `[DOMICILIO FISCAL]` | Ídem y pie de la landing |
| `[CORREO ELECTRÓNICO]` de contacto | Ídem |
| `[CORREO DE PRIVACIDAD]` (puede ser el mismo) | Política de privacidad |
| `[TELÉFONO]` | Términos, pie de la landing |
| `[HORARIO DE ATENCIÓN]` | Términos §14 (lo exige Culqi) |
| `[TAMAÑO DE EMPRESA]` (ventas anuales en UIT) | Plazo del Oficial de Datos Personales |
| Región real de Railway (api, base de datos) y de SES (`AWS_REGION` en producción) | Política de privacidad, flujo transfronterizo |
| Código o número de inscripción del banco de datos de WizyDoc, si existe | Política de privacidad |
| ¿Hay cuentas con suscripción activa en Culqi? | R3 |

## 8. Decisiones del humano

- **D1. Planes de pago en la landing durante la beta.**
  - (a) Mostrarlos con "Disponible pronto". Los términos dirían que en la beta
    sólo se contrata Gratis.
  - (b) Ocultarlos hasta reactivar Culqi.
  - **Recomiendo (a).** Es coherente con el plan `beta-free-plan-only` y le
    muestra a Culqi el modelo de negocio. Hay que confirmar con Culqi si
    aceptan revisar sin cobro activo.
- **D2. Plazo de conservación tras la baja de un consultorio:** cuánto tiempo
  se conservan los datos para que pueda recuperarlos antes de suprimirlos.
  **Recomiendo 90 días** para exportar y luego supresión. Nunca más de 2
  años (reglamento, art. 31.2).
- **D3. Política de devoluciones:**
  - (a) Sin reembolsos por periodos parciales, con devolución de cobros
    indebidos o duplicados.
  - (b) Prorrateo.
  - **Recomiendo (a)**, más simple. Aplica sólo cuando se reactive el cobro.
- **D4. Ficha del paciente en Gratis:** abrir la lectura y la exportación
  (recomendado, por R2), o mantener el 402 y atender a mano los pedidos de
  acceso.

## 9. Qué debe revisar el abogado

1. Si un proveedor **sólo digital** sin local está obligado al Libro de
   Reclamaciones según el texto vigente del D.S. 011-2011-PCM tras el D.S.
   006-2014-PCM y el D.S. 101-2022-PCM. Si un servicio **gratuito** lo exige.
   El monto de la multa.
2. Si un médico independiente o una microempresa médica que contrata WizyDoc
   es consumidor (art. IV.1.2 y 1.3 de la Ley 29571). Según la respuesta,
   validez de las secciones 5, 11, 12 y 13.
3. Si la especialidad de la cita es un dato sensible. Cómo documentar el
   consentimiento escrito (art. 13.6 de la Ley 29733) en un formulario web.
   Si la excepción del art. 14.6 cubre la ficha.
4. El anexo de encargo de tratamiento: contenido mínimo según los arts. 28 a
   36 del reglamento. Si la aceptación en línea basta como "relación jurídica"
   (Ley 29733, art. 2.7).
5. Si a la ficha de WizyDoc le aplican las normas de historia clínica
   (`[sin verificar]` Ley 26842, Ley General de Salud, y la norma técnica de
   historia clínica del MINSA), con sus plazos de conservación mínimos, que
   chocarían con la supresión.
6. El flujo transfronterizo (Railway, AWS): ¿aplica la excepción del art. 15.4
   de la Ley a los datos de la cuenta? ¿Qué garantías (art. 20 del
   reglamento) y qué comunicación a la Dirección General (art. 21.2) se
   necesitan para los datos de pacientes, y quién la presenta, el consultorio o
   WizyDoc?
7. La redacción de la limitación de responsabilidad y de la cláusula de
   jurisdicción.
8. La redacción final de la política de privacidad
   (`docs/legal/politica-privacidad.md`).
