# PRD: onboarding por pasos

**Estado:** v2, 9 de noviembre de 2026, actualizada el 12 de noviembre. Con las decisiones del
humano (sección 14): la versión B, sin invitar y con el paso «Tu plan», en cuatro pasos, construida en
`backend-infra`. El onboarding termina en «Tu horario». Lo marcado **[Propuesta]**
queda firme cuando el humano apruebe el mockup.
**Autor:** product-manager · **Ticket:** WIZ-77 («Onboarding asks for the personal data») ·
**Rama:** `wiz-77-onboarding-asks-for-the-personal-data`
**Referencias:** `docs/PRODUCT.md` («Para quién», «Principios», «Riesgos conocidos», «Estado › Primer
uso»), `docs/features/primer-uso/plan.md` (D-1 a D-3, O-1 a O-7, G-1 a G-6 y «Fuera de alcance»),
`backend-infra/docs/spec/sign-up-code/spec.md` (WIZ-75), `backend-infra/docs/spec/sign-in/spec.md`
(WIZ-78, la primera de sus dos specs), `docs/legal/politica-privacidad.md` (Parte A).

Este documento dice **qué** se construye y **por qué**. El **cómo** (rutas, dónde se guarda cada
dato, la sesión) lo deciden el planner y el engineer. Los textos entre comillas son propuestas hasta
que el humano apruebe el mockup; desde entonces manda el mockup.

**Leyenda:** **[Decisión]** firme, del humano o de un plan aprobado. **[Propuesta]** regla que
propongo; queda firme cuando el humano la apruebe. **[Supuesto]** algo que asumo sin datos.
**[Riesgo]** conocido, por aceptar o mitigar.

## Resumen

- El registro nuevo (WIZ-75 en el backend y WIZ-76 en platform) crea al usuario sólo con correo y
  contraseña. El nombre, el apellido y el celular pasan al onboarding, que además pide el tratamiento
  (Dr./Dra.).
- **Decidido el 9 de noviembre de 2026: la versión intermedia, en cuatro pasos,** tres obligatorios y
  uno opcional, y siempre con la palabra «consultorio»:
  1. **Tus datos** (obligatorio), con el celular obligatorio.
  2. **Tu plan** (obligatorio), una pantalla nueva: los cuatro planes, con Gratis elegido y los de
     pago deshabilitados mientras dure la beta.
  3. **Tu consultorio** (obligatorio): el formulario de hoy, con el nombre prellenado («Consultorio de
     la Dra. Ana Pérez»).
  4. **Tu horario** (opcional). Si lo guarda, llega al panel con el link recibiendo reservas.
- Si omite el horario, llega al panel con la guía de primeros pasos de hoy («Te falta 1 paso para
  recibir citas»).
- **El onboarding no invita a nadie:** se sigue invitando desde Usuarios, como hoy.
- **La cuenta no es un paso:** se crea al confirmar el registro, sin nombre y sin plan, con el usuario
  como dueño (segunda spec de WIZ-78). «Tu plan» le crea el plan, y «Tu consultorio», la organización
  y la sede.
- La propuesta del humano (organización y especialidades → sede → invitar → horario) modelaba mejor
  una clínica con sedes, pero le mostraba al médico independiente la estructura que `PRODUCT.md` pide
  esconder y le pedía dos veces el mismo nombre. Se descartó.
- Cambia dos decisiones de alcance de primer-uso: el tratamiento y el horario entran al onboarding.
  Además el plan, que hoy no se elige, pasa a tener su pantalla.
- **Se construye en `backend-infra` y sale con el registro nuevo y la sesión de Cognito,** porque el
  api de Railway nunca va a aceptar esa sesión. Así el registro nuevo no llega a nadie sin el paso
  «Tus datos», y ningún médico aparece sin nombre en su link ni en los correos a sus pacientes.
- **«Renombrar sede»** (editar el nombre y la dirección del consultorio desde el panel) va justo
  después, en `backend-infra`: es WIZ-79, bloqueado por este ticket.
- **La finalidad del celular** (soporte y avisos de la cuenta) entra a la política de privacidad en
  WIZ-80, que tiene que estar antes de publicar el onboarding nuevo.

---

## 1. Problema y objetivo

**Lo que rompe el registro nuevo.** Con WIZ-75 el usuario se crea ya confirmado, «sin nombre,
apellido ni teléfono» (`sign-up-code/spec.md`, «Crear la cuenta», paso 5). La misma spec deja fuera
de alcance «pedir nombre, apellido, teléfono y tratamiento» en el onboarding: es este ticket. Hoy el
nombre del médico aparece en:
- el link de reservas, como «Reserva tu cita con Dra. Ana Pérez» (`get-clinic-doctors.query.ts`,
  `booking-header.tsx`);
- los correos al paciente (confirmación y reprogramación) y al médico (cancelación, reprogramación y
  los avisos del 80 % y el 100 % del tope);
- el saludo del panel, «Mi perfil» y la lista de Usuarios.

**Lo que ya resolvió primer-uso y no hay que perder.** Desde el 25 de octubre de 2026 el onboarding
es un solo formulario, «Tu consultorio». Crea la organización y la sede con un mismo nombre (O-3) y
deja al dueño como médico con su especialidad. El panel le pide lo que falta (el horario) y no le
ofrece el link hasta que funciona. El recorrido bajó de 5 formularios a 2.

**Lo que pide el humano.** Llevar al onboarding, además de los datos personales, dos cosas que hoy
se hacen desde el panel: invitar a alguien y definir el horario. Las dos se pueden omitir. El 9 de
noviembre de 2026 decidió llevar sólo el horario: se sigue invitando desde Usuarios (sección 14).

**Objetivo.** Que el médico independiente, desde el celular, termine el onboarding con su link
recibiendo reservas, sin ver «organización», «sede» ni «rol», y sin que el panel tenga que pedirle
nada más. Quien omite el horario termina como hoy: en el panel, con la guía.

---

## 2. Para quién

| Usuario | Qué hace en esta feature | Qué le importa |
| --- | --- | --- |
| **Médico independiente** (el foco): dueño, administrador y médico a la vez. Se registra desde el celular, a menudo entre consultas **[Supuesto]**, según la pregunta abierta «¿Quién usa el panel?» de `PRODUCT.md`. | Hace los cuatro pasos. | Terminar rápido, escribir poco con el teclado del celular, entender cada palabra y que su link funcione. |
| **Dueño de una clínica o de un consultorio con varios médicos** (segmento de «Después») | Hace los cuatro pasos. Después invita a un médico o a la recepción desde Usuarios, como hoy. | Que la clínica lleve su marca y poder invitar a su equipo. Las demás sedes y personas las agrega desde el panel. |
| **Personal de la clínica** (médico invitado o recepción) | No ve el onboarding. Lo invitan desde Usuarios y entra por «Aceptar invitación», como hoy. | Que la invitación diga quién lo invita y a dónde. |
| **Paciente sin cuenta** | No ve el onboarding, pero sí su resultado: el nombre y el tratamiento del médico, el nombre y la dirección del consultorio, la especialidad y los horarios. | Reconocer a su médico en el link y llegar al consultorio. |

---

## 3. Las dos propuestas

**[Decisión, 9 de noviembre de 2026]** B, sin el paso de invitar (sección 14). La comparación queda
como registro de por qué. Ese mismo día el humano agregó el paso «Tu plan» (sección 4.3), que la
comparación no considera: le suma a B una pantalla obligatoria, sin campos que escribir.

### 3.1 Comparación

| | **A. Propuesta del humano** | **B. Versión intermedia** (la decidida) |
| --- | --- | --- |
| Pasos | 1. Organización y sus especialidades. 2. Clínica o sede. 3. Invitar (opcional). 4. Horario (opcional). Los datos personales también, sin un paso definido. | 1. Tus datos. 2. Tu consultorio (nombre prellenado, dirección y especialidad). 3. Horario (opcional). Se invita desde Usuarios. |
| Pantallas obligatorias | 3 (datos, organización y sede), o 2 si los datos van con la organización. | 2. |
| Lo que el médico independiente escribe con el teclado | Nombre, apellido, celular, nombre de la organización, especialidades, nombre de la sede y dirección: 7 campos, con el mismo nombre dos veces. Hoy crear una sede pide además su teléfono; primer-uso lo quitó sólo del onboarding (D-2). | Nombre, apellido, celular, dirección y especialidad: 5 campos. El nombre del consultorio ya viene escrito. |
| Palabras que ve | «Organización», «sede» y «clínica». | «Consultorio». |
| Especialidad | Las de la organización, como catálogo. Si no se le asigna ninguna al dueño, no aparece en el link. | La del dueño, como hoy: queda asignada a él y cuenta para el link. |
| Pasos opcionales | Invitar antes que el horario: el médico solo primero omite un paso que no le sirve y después llega al que hace funcionar su link. | Sólo el horario, porque es lo único que le falta para recibir citas. |
| Clínica con sedes | **Mejor.** La organización («Clínica San Pablo») y la sede («San Borja») se llaman distinto desde el principio, y el catálogo de especialidades facilita invitar a médicos de otras especialidades. | **Peor.** La organización y la primera sede se llaman igual (O-3) y hoy no se pueden renombrar. Si invita a un médico de otra especialidad, la escribe al invitarlo desde Usuarios. |
| Frente a lo ya decidido | Deshace parte de primer-uso (de 5 formularios a 2, y O-3) y choca con «Riesgos conocidos»: «el onboarding del médico solo debe esconder esa complejidad». | Conserva primer-uso y sus reglas, y suma lo que exige el registro nuevo. |

### 3.2 Por qué B

Pensando en el médico independiente que se registra desde el celular:

1. **Esconde la estructura sin costo para quien se registra.** En la beta toda cuenta empieza en Gratis,
   que incluye 1 sede, y los planes con más sedes se asignan a mano. En el onboarding, distinguir
   organización y sede no le sirve a nadie.
2. **Escribe menos.** Son 5 campos en lugar de 7, y el más largo después de la dirección ya viene
   escrito. **[Supuesto]** Cada pantalla y cada campo en el celular es una ocasión de abandonar. No hay
   datos de la beta que lo midan.
3. **La especialidad queda donde sirve:** en el médico, que con ella y su horario aparece en el link.
4. **El horario es el único paso opcional,** porque es el que convierte el registro en citas. Invitar
   no le sirve al médico solo, y sigue en Usuarios.
5. **Los datos van primero.** El nombre prellenado los necesita, y así el médico tiene nombre antes de
   poder aparecer en el link.
6. **Reutiliza lo que el médico ya conoce.** «Tu consultorio» es el formulario de hoy, con sus reglas
   (O-1 a O-7), «Tu horario» es el editor de «Mi disponibilidad», y omitir el horario lleva a la guía
   de hoy. Lo nuevo es el backend, que se construye en `backend-infra` (sección 14), y la pantalla «Tu
   plan».

**Lo que se pierde frente a A:** una clínica con sedes (segmento de «Después») nombra su primera sede
igual que su organización y hoy no puede renombrarla. Se mitiga con «Renombrar sede», que va justo
después de esta feature (sección 14), no con el onboarding.

**Otras alternativas que descarté:**
- **Datos y consultorio en una sola pantalla.** Ahorra una pantalla, pero son 7 campos con
  desplazamiento en el celular, y el nombre prellenado cambiaría mientras el médico escribe más arriba.
- **La especialidad en «Tus datos»,** porque es un dato de la persona. Habría que guardarla antes de
  que exista el consultorio y cambiar el formulario y el endpoint de hoy, sin ninguna ventaja que el
  médico note.

---

## 4. El flujo

### 4.1 Reglas generales

- **[Propuesta]** Una pantalla por paso, en la tarjeta del onboarding de hoy (`AuthCard`), con el
  avance a la vista («Paso 1 de 4»). El paso 4 dice «Opcional». El avance cuenta sólo los pasos que
  esa persona va a ver (sección 6).
- **[Propuesta]** Cada paso aparece sólo si falta lo que pide. «Tus datos» aparece si falta el nombre,
  el apellido o el celular. «Tu plan» aparece si la cuenta no tiene plan. «Tu consultorio» aparece si
  la cuenta no tiene organización. «Tu horario» aparece si todavía no lo guardó ni lo omitió.
- **[Decisión, 9 de noviembre de 2026]** La cuenta no es un paso: cuando el médico llega al onboarding
  ya existe, sin nombre y sin plan, porque se crea al confirmar el registro (sección 14).
- **[Propuesta]** Cada paso obligatorio se guarda al pulsar su botón. Si el médico cierra la app y
  vuelve, sigue en el paso donde quedó, con lo que ya guardó.
- **[Decisión, 12 de noviembre de 2026] El onboarding termina en «Tu horario»,** al pulsar «Guardar
  horario» o «Lo hago después». No termina al crear el consultorio: si el médico cierra la app en «Tu
  horario», la próxima vez vuelve a ese paso, hasta que lo guarde o lo omita. Recién entonces entra
  al panel.
- **[Propuesta]** «Atrás» existe en «Tu plan» y en «Tu consultorio», y vuelve al paso anterior sin
  perder lo escrito. Una vez creado el consultorio no se vuelve a los pasos obligatorios: los datos se
  cambian en «Mi perfil».
- **[Decisión, primer-uso]** El onboarding no tiene ningún elemento coral: el único coral llega en el
  panel, con «Copiar link de reservas».
- **[Propuesta] Pensado para el celular:**
  - a 375 px no hay desplazamiento horizontal y los botones van a lo ancho;
  - cada campo abre el teclado que le corresponde (el numérico para el celular);
  - los campos usan el autocompletado del navegador (`given-name`, `family-name`, `tel-national` y
    `street-address`).

### 4.2 Paso 1: «Tus datos» (obligatorio)

Título «Tus datos». Descripción: «Tus pacientes verán tu nombre al reservar.»

| Campo | ¿Obligatorio? | Regla | Error |
| --- | --- | --- | --- |
| Tratamiento | No | «Sin tratamiento», «Dr.» o «Dra.», como en «Mi perfil». Si no elige nada, queda sin tratamiento. | — |
| Nombre | Sí | Se recorta. Mismo largo máximo que el registro de WIZ-72 (100). | «Escribe tu nombre.» |
| Apellido | Sí | Igual que el nombre. | «Escribe tu apellido.» |
| Celular | Sí (sección 14) | +51, con la validación del registro de WIZ-72 (`phone.vo.ts`). | «Escribe tu celular.» o «Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.» |

- **[Propuesta]** El tratamiento es opcional, como en «Mi perfil». Sin él, el link muestra el nombre
  completo. **[Supuesto]** Algunos profesionales de la salud no usan «Dr.» ni «Dra.», y el foco es el
  médico «de cualquier especialidad».
- **[Propuesta]** Debajo de los campos, una vista previa que se actualiza mientras escribe, con el
  texto de «Mi perfil»: «Así te verán tus pacientes: Dra. Ana Pérez».
- **[Propuesta]** La ayuda del celular dice para qué se usa: «Para ayudarte con tu cuenta. Tus
  pacientes no lo ven.» Es cierto: el booking y los correos al paciente no usan el celular del
  usuario.
- **[Decisión, 9 de noviembre de 2026]** La finalidad del celular es que WizyDoc pueda llamar o
  escribirle al médico para ayudarlo con su cuenta (soporte y avisos de la cuenta). No incluye
  novedades comerciales, que siguen como decisión abierta en la política (A.2). La política la declara
  en WIZ-80, con el mismo sentido que la ayuda (pv-1).
- **[Decisión, primer-uso D-2 y tope k-7]** El celular no se copia a la sede ni al «WhatsApp o
  teléfono para pacientes».
- Botón: «Continuar».

### 4.3 Paso 2: «Tu plan» (obligatorio)

**[Decisión, 9 de noviembre de 2026]** Es una pantalla nueva. El onboarding de hoy no la tiene: el
formulario «Tu consultorio» manda `plan = FREE` en un campo oculto y muestra la frase de la beta. El
humano la eligió frente a crear Gratis sin pantalla, como hoy (sección 14).

- Título «Tu plan». **[Propuesta]** Descripción: «Ningún plan limita médicos. Cambian las citas al mes
  y las sedes.», que es lo que separa los planes en `PRODUCT.md` («Planes»).
- Muestra los cuatro planes de `platform/src/lib/plans.ts`: Gratis, Consultorio, Clínica y Red.
  - **[Propuesta]** Cada plan muestra su precio, sus citas al mes y sus sedes. Hoy `plans.ts` dice
    las citas al mes sólo de Gratis («Gratis · 10 citas al mes, 1 sede»); a los de pago les faltan
    (150 y 600, según `PRODUCT.md`). El texto final lo fija el mockup.
  - **[Propuesta]** En el celular, los planes van uno debajo del otro, sin desplazamiento horizontal.
- Gratis viene elegido. Consultorio, Clínica y Red se ven deshabilitados, con el aviso de la beta que
  hoy está en «Tu consultorio». En el código dice: «Durante la beta, todas las cuentas empiezan en
  Gratis y los planes de pago se activan a pedido.» El encargo lo citó terminando en «se asignan a
  mano»; el mockup fija cuál queda.
- **El backend sólo acepta Gratis mientras dure la beta,** aunque alguien mande otro plan a mano, como
  exige `docs/features/beta-free-plan-only/plan.md`: responde con el error «Durante la beta sólo está
  disponible el plan Gratis» y no crea el plan.
- Al pulsar el botón, le crea el plan Gratis a la cuenta.
- Botones: «Continuar» (principal) y «Atrás», que vuelve a «Tus datos».
- Queda lista para cuando vuelva el cobro con Culqi, que está fuera de alcance (sección 9).

### 4.4 Paso 3: «Tu consultorio» (obligatorio)

Es el formulario de primer-uso (O-1 a O-7), con estos cambios:

- **[Propuesta] El nombre del consultorio viene prellenado** y se puede editar:

  | Tratamiento | Nombre sugerido |
  | --- | --- |
  | Dra. | «Consultorio de la Dra. Ana Pérez» |
  | Dr. | «Consultorio del Dr. Juan Pérez» |
  | Sin tratamiento | «Consultorio de Ana Pérez» |

  - Usa el nombre y el apellido tal como los escribió, también si puso los dos apellidos.
  - Si vuelve a «Tus datos» y cambia su nombre o su tratamiento, la sugerencia se actualiza, salvo que
    ya la haya editado.
  - **[Supuesto]** Si la sugerencia pasa el largo máximo del nombre (100), el campo queda vacío, con el
    placeholder de hoy.
- «Atrás» lleva a «Tu plan».
- **[Propuesta]** La descripción deja de decir «Es el último paso», porque después viene el horario.
  Queda «Tus pacientes verán estos datos al reservar.»
- **[Decisión, 9 de noviembre de 2026]** La frase de la beta pasa a «Tu plan», y este formulario deja
  de mandar el plan.
- Lo demás no cambia:
  - la dirección y «Tu especialidad» son obligatorias, con una sola especialidad (D-1); las demás se
    agregan en «Mi perfil»;
  - el botón «Crear mi consultorio»;
  - crea la organización y la sede dentro de la cuenta, con el dueño como administrador y como médico
    de la sede, con su especialidad;
  - la organización y la sede llevan un mismo nombre (O-3), y la sede se crea sin teléfono (D-2);
  - los errores de O-7.
- **[Decisión, 9 de noviembre de 2026] Lo que cambia de O-3 y O-6:** la cuenta ya existe, creada sin
  nombre al confirmar el registro, y el onboarding no la crea (sección 14). Por eso ya no se da el
  error a medias de O-6 («Tu cuenta quedó creada, pero no pudimos crear tu consultorio»). La cuenta
  no tiene nombre.
- **Lo que cambia de O-5:** después de crear el consultorio, sigue a «Tu horario» en lugar de ir al
  panel.
- **[Decisión, 9 de noviembre de 2026] Sin el modo «Termina de crear tu consultorio» (D-3 de
  primer-uso).** En el backend nuevo toda cuenta nace sin organización al confirmar el registro, y las
  cuentas de la beta no se migran, así que nadie lo usaría. Quien ya tiene sus datos y su plan y no
  tiene consultorio (por ejemplo, porque cerró la app después de «Tu plan») empieza en este paso, con
  el título de siempre y con «Atrás», y la sugerencia usa el nombre que ya guardó.

### 4.5 Paso 4: «Tu horario de atención» (opcional)

- Descripción: «Tus pacientes solo podrán reservar en estos horarios.» (el texto de G-2).
- **[Propuesta]** Usa el mismo editor de «Mi disponibilidad», con sus reglas de hoy.
- **[Propuesta] El editor empieza vacío, sin un horario sugerido.** Si el médico acepta un horario
  sugerido sin revisarlo, su link recibe citas a horas en que no atiende. Como el panel todavía no
  cancela ni mueve citas, terminaría llamando al paciente, que es justo lo que la tesis elimina.
- Botones: «Guardar horario» (principal) y «Lo hago después» (secundario). Sigue siendo opcional:
  «Lo hago después» lo omite.
- Cualquiera de los dos botones termina el onboarding y lleva al panel de su sede (sección 4.6).
- **[Decisión, 12 de noviembre de 2026]** Cerrar la app no cuenta como omitirlo: la próxima vez vuelve
  a este paso (sección 4.1).

### 4.6 La llegada al panel

Al terminar el onboarding, con «Guardar horario» o con «Lo hago después», llega a Inicio. Como la
cuenta tiene una sola sede, entra directo a ella, sin «Elige dónde entrar» (O-5).

| ¿Guardó el horario? | Lo que ve en Inicio |
| --- | --- |
| Sí | «Tus pacientes ya pueden reservar desde el link.», con «Copiar link de reservas» y «Ver como paciente» (L-2 de primer-uso). |
| No | La guía «Te falta 1 paso para recibir citas», con «Definir horario» (G-2), y sin «Copiar link de reservas» (L-1). |

---

## 5. Qué pasa si omite un paso

| Paso | ¿Se puede omitir? | Si lo omite | Dónde lo hace después | ¿Se le vuelve a pedir? |
| --- | --- | --- | --- | --- |
| 1. Tus datos | No | — | Los cambia en «Mi perfil». | — |
| 2. Tu plan | No | — | En ninguna parte durante la beta: los planes de pago se asignan a mano y el panel no cambia de plan. | — |
| 3. Tu consultorio | No | — | El nombre y la dirección, con «Renombrar sede» (WIZ-79), que va justo después de esta feature (sección 14). Hasta entonces no se pueden editar. La especialidad, en «Mi perfil». | — |
| 4. Tu horario | Sí, con «Lo hago después». Cerrar la app no lo omite. | El link no recibe reservas, y el panel no le ofrece copiarlo. | En «Mi disponibilidad», desde la guía. | Sí. Si cerró la app sin guardarlo ni omitirlo, vuelve a este paso. Si pulsó «Lo hago después», la guía del panel sigue a la vista hasta que lo defina (G-5). |

Invitar no es un paso: se hace desde Usuarios, como hoy, y el panel no le recuerda invitar.

---

## 6. Quién ve cada paso

| Usuario | Pasos que ve |
| --- | --- |
| Nuevo, registrado con el flujo de WIZ-75 y WIZ-76 | 1, 2, 3 y 4 |
| Con sus datos y sin plan, porque cerró la app después de «Tus datos» | 2, 3 y 4 |
| Con sus datos y su plan, y sin consultorio, porque cerró la app después de «Tu plan» (sección 4.4) | 3 y 4 |
| Con consultorio, porque cerró la app en «Tu horario» sin guardarlo ni omitirlo | 4 |
| Dueño que ya terminó el onboarding | Ninguno |
| Invitado (ADMIN, DOCTOR o USER) | Ninguno: acepta la invitación que le mandan desde Usuarios, como hoy |
| Usuario de una cuenta que no es el dueño y no tiene memberships | Ninguno. Como hoy, ve «No perteneces a ninguna organización todavía.» |

Mientras platform use el api de hoy, quien se registra ahí sigue viendo el onboarding de primer-uso,
sin cambios: este onboarding sólo existe en el backend nuevo (sección 14).

---

## 7. Qué cambia respecto de hoy

| Tema | Hoy | Con este PRD |
| --- | --- | --- |
| Nombre, apellido y celular | Los pide el registro. | Los pide el paso 1. El registro lo cambian WIZ-75 y WIZ-76. |
| Tratamiento | Sólo en «Mi perfil». Primer-uso lo dejó fuera del onboarding. | En el paso 1, opcional. |
| Plan | No se elige: «Tu consultorio» manda `plan = FREE` en un campo oculto y muestra la frase de la beta. | Es el paso 2, una pantalla nueva con los cuatro planes: Gratis elegido y los de pago deshabilitados. El backend sólo acepta Gratis. |
| Nombre del consultorio | Campo vacío con el placeholder «Consultorio Dra. Quispe». | Prellenado con el nombre del médico. |
| Horario | Se define en el panel, desde la guía. Primer-uso lo dejó fuera del onboarding. Después de guardarlo, el médico sigue en «Mi disponibilidad» y vuelve a Inicio a mano (r-6). | Es el paso 4, opcional. Si lo omite, la guía del panel funciona como hoy. |
| La cuenta (el tenant) | La crea el onboarding (`POST /account`) con la suscripción Gratis, y le pone el nombre del consultorio (O-3). | Se crea al confirmar el registro, sin nombre y sin plan. «Tu plan» le crea el plan, y «Tu consultorio», la organización y la sede. |
| Después de crear el consultorio | Va al panel. | Va a «Tu horario». |
| Fin del onboarding | Al crear la cuenta (`onboardingCompleted`), antes de que exista el consultorio. | Al guardar u omitir «Tu horario». |
| Recorrido hasta tener el link funcionando | «Tu consultorio» → panel → «Definir horario» → guardar → volver a Inicio. | «Tus datos» → «Tu plan» → «Tu consultorio» → «Tu horario» → panel con el link listo. |
| Dónde vive el onboarding | En el api de hoy, con Better Auth y Postgres. | En `backend-infra`, con Cognito y DynamoDB. |

El recorrido nuevo tiene dos pantallas más que el de hoy: «Tus datos», que exige el registro nuevo, y
«Tu plan». A cambio, el médico no tiene que ir del panel a «Mi disponibilidad» y volver.

No cambian:
- el booking;
- «Mi perfil», «Mi disponibilidad» y la guía del panel;
- las reglas del consultorio (O-1 a O-7), salvo lo que cambia de O-3, O-4, O-5 y O-6 (sección 4.4).
  El endpoint, en cambio, es nuevo, en `backend-infra`;
- la invitación desde Usuarios y su correo.

---

## 8. Privacidad

- **pv-1** Los datos del paso 1 son del médico, y de ellos WizyDoc es el titular (Parte A de la
  política de privacidad). Se pide sólo lo que se usa. El celular necesita una finalidad declarada,
  según el principio de proporcionalidad: el tratamiento debe ser «adecuado, relevante y no
  excesivo» para su finalidad (Ley 29733, art. 7). El humano decidió el 9 de noviembre de 2026 que es
  obligatorio y que su finalidad es el soporte y los avisos de la cuenta (sección 4.2). La política lo
  dice en WIZ-80, que se valida con un abogado junto con WIZ-56 y tiene que estar antes de publicar el
  onboarding nuevo.
- **pv-2** El celular del médico no se muestra a los pacientes, no se copia a la sede ni al contacto
  para pacientes (D-2 de primer-uso y k-7 del tope), y la pantalla lo dice.
- **pv-3** El onboarding no le da acceso a nadie más. Invitar a alguien le da acceso a la agenda de la
  sede y, en los planes de pago, a sus pacientes, porque la ficha es del consultorio. Eso se sigue
  decidiendo desde Usuarios.
- **pv-4** La política de privacidad dice que los datos del profesional se dan «al registrarte», y
  que los obligatorios son «los campos marcados como obligatorios en el registro» (A.1 y A.4). Con
  esta feature, el nombre, el apellido y el celular se dan en el onboarding, después del registro, y
  el celular es obligatorio (sección 13).
- **pv-5** La política dice que no se usan herramientas de analítica de terceros: los criterios de
  éxito se miden con consultas a la base (sección 10).

---

## 9. Fuera de alcance

- El registro (WIZ-75 y WIZ-76), el inicio de sesión con Cognito y la cuenta que se crea al confirmar
  el registro (WIZ-78), que son otros tickets.
- **Invitar desde el onboarding.** Decidido por el humano el 9 de noviembre de 2026: se sigue
  invitando desde Usuarios, como hoy. Así el médico independiente, que casi nunca invitaría a nadie al
  empezar **[Supuesto]**, tiene un paso menos, y el onboarding no depende de que aceptar una invitación
  funcione con Cognito.
- Editar el nombre o la dirección de la sede o de la organización: es «Renombrar sede», WIZ-79 («Edit
  the clinic name and address»), que va justo después de esta feature, en `backend-infra` (sección 14).
- Crear una segunda sede u organización desde el onboarding.
- **Cobrar un plan de pago desde «Tu plan»:** el cobro con Culqi sigue congelado durante la beta
  (`docs/features/beta-free-plan-only/plan.md`). La pantalla queda lista para cuando vuelva.
- Cambiar de plan desde el panel.
- Un horario sugerido o plantillas de horario.
- Cambios en «Mi disponibilidad», en «Mi perfil», en la guía del panel, en Usuarios y en el booking.
- Pedir la aceptación de los términos, que va en el registro (WIZ-72 y WIZ-75).
- Herramientas de analítica.

**Siguiente** (candidatos, sin compromiso):
- Compartir el link por WhatsApp al terminar o desde el panel.
- Mostrar organización y sedes en el onboarding, e invitar desde él, a quien diga que tiene más de un
  local, cuando el foco pase a las clínicas.

---

## 10. Criterios de éxito

La app no tiene analítica (pv-5). Todo se mide con consultas a la base sobre las cuentas creadas
desde el lanzamiento, o mirando a médicos reales usarla. La beta tiene pocas cuentas, así que los
números son señales, no estadística. **[Supuesto]** Las metas son propuestas: las fija el humano.

1. **El link funciona al terminar** (el criterio principal). De los consultorios creados en una semana,
   cuántos tienen al menos un médico en el link al cierre de esa semana. Se compara con los creados con
   el onboarding de hoy, desde el 25 de octubre de 2026. Meta propuesta: más que hoy. Hoy el horario
   no guarda cuándo se creó (`doctor_schedule` no tiene `created_at`). Si en el backend nuevo tampoco
   lo guarda, se mide como una foto al cierre de la semana.
2. **Primera reserva.** Consultorios con al menos una cita reservada en sus primeros 7 días. Se compara
   la fecha de creación de la organización con la de la primera cita.
3. **Abandono en los pasos obligatorios.** Usuarios registrados con el flujo nuevo que a los 7 días no
   tienen consultorio (su cuenta no tiene organización), separados entre «sin datos», «con datos y sin
   plan» y «con plan y sin consultorio». Se mide en `backend-infra`, donde viven los usuarios nuevos.
   Meta propuesta: no más que los usuarios confirmados sin cuenta de hoy, en el api. Aparte, sin meta:
   cuántos crearon el consultorio y a los 7 días siguen en «Tu horario», sin guardarlo ni omitirlo.
4. **Tiempo y comprensión,** mirando a médicos usarla. Cinco médicos reales completan los pasos
   obligatorios desde su celular en menos de 2 minutos, sin preguntar qué significa algo ni por qué no
   pueden elegir un plan de pago. Sirve además para validar la pregunta abierta «¿Quién usa el
   panel?».
5. **Límite que no se cruza:** ningún médico aparece en el link sin nombre.

---

## 11. Prerrequisitos técnicos

Los señalo sin resolverlos: el cómo es del planner y del engineer.

1. **La sesión de Cognito en platform** (WIZ-78). Hoy platform decide si mostrar el onboarding, y en
   qué modo, con `GET /user/me` y `GET /user/me/memberships` del api, usando la cookie de Better Auth
   (`lib/auth/onboarding-mode.ts` y `(auth)/onboarding/layout.tsx`). Un usuario creado en Cognito y
   DynamoDB no tiene ni esa cookie ni una fila en `user` de Postgres, y el api de hoy nunca va a
   aceptar su sesión (sección 14). Platform tiene que decidirlo con la sesión de Cognito y los datos de
   `backend-infra`: en qué paso va (prerrequisito 5).
2. **Los datos personales viven sólo en DynamoDB, en el ítem del usuario, no en Cognito** (sección 14;
   `user.entity.ts`, con `name`, `lastName`, `phone` y `treatment` opcionales). Hoy se editan con
   `PATCH /user/me/profile` del api, en Postgres, que exige cuenta, correo confirmado y onboarding, y
   el booking, los correos y las listas leen el nombre de Postgres (`get-clinic-doctors.query.ts`).
   Como el usuario nuevo nunca pasa por el api de hoy, en el backend nuevo todo lo que muestra su
   nombre lo lee de DynamoDB, y el paso 1 lo guarda antes de que exista el consultorio.
3. **La cuenta (el tenant): resuelto.** Se crea al confirmar el registro, sin nombre y sin plan, con el
   usuario como dueño, en la segunda spec de WIZ-78 (sección 14). Hoy la crea `POST /account` del api
   desde el onboarding, con la suscripción Gratis (`complete-account-setup.usecase.ts`), y el registro
   de `backend-infra` deja `accountId` vacío. El onboarding ya no crea la cuenta: «Tu plan» le crea el
   plan, y «Tu consultorio», la organización y la sede. La cuenta no tiene nombre propio: el nombre
   vive en la organización y en la sede.
4. **El plan, el consultorio y el horario se construyen en `backend-infra`** (sección 14). Hoy viven
   en el api, con Postgres: `POST /account` (el plan, que durante la beta sólo acepta `FREE`, según
   `beta-free-plan-only`), `POST /account/first-clinic` (con la política `account`, `confirmed` y
   `onboarded`) y `PUT /clinic/:resourceId/availability`, y toman el `userId` y el `accountId` de la
   sesión de Better Auth. En `backend-infra` mantienen sus reglas (sólo Gratis durante la beta; O-1 a
   O-7, con lo que cambia en la sección 4.4, y las de «Mi disponibilidad») y toman al usuario y su
   cuenta de la sesión de Cognito, con la `policy()` compartida de la segunda spec de WIZ-78. El modelo en DynamoDB está en curso
   (`docs/features/auth-cognito/inventario-acceso-datos.md`, en el worktree `dynamodb-data-model`).
5. **Qué marca el fin del onboarding.** Hoy `onboardingCompleted` pasa a `true` al crear la cuenta,
   antes de que exista el consultorio, y las políticas `onboarded: true` dependen de ese dato. Con la
   cuenta creada al confirmar el registro, ese momento ya no sirve. Para el producto, el onboarding
   termina al guardar u omitir «Tu horario», no al crear el consultorio (sección 4.1). Está acordado
   que el paso en que va cada persona se guarda en el usuario; cómo, lo decide el plan.
6. **El tratamiento.** Hoy el api sólo lo acepta de quien atiende en alguna sede (`get-my-profile.query.ts`,
   «¿Puede tener tratamiento?»), y «Mi perfil» lo esconde en ese caso. Con el orden nuevo, el médico lo
   elige antes de que exista el consultorio, y el backend nuevo tiene que aceptarlo.
7. **Las invitaciones: ya no aplica.** El onboarding no invita (sección 14). Que aceptar una invitación
   funcione con Cognito sigue siendo trabajo de WIZ-71, sin relación con esta feature.
8. **El orden de publicación: sale con el registro nuevo y la sesión de Cognito,** cuando platform pase
   al backend nuevo. Así el registro nuevo, que ya no pide el nombre, nunca llega a los usuarios sin el
   paso 1. Como el onboarding termina en el panel y en el link de reservas, el médico necesita además
   que Inicio, la guía, «Mi disponibilidad», «Mi perfil» y el booking funcionen con el backend nuevo:
   es el orden de la migración, no de este ticket. Hasta entonces, quien se registra en el api de hoy
   ve el onboarding de primer-uso, sin cambios.
9. **Las pruebas e2e.** La suite corre el api y platform con Better Auth (`platform/e2e/`), y
   `createOnboardedAdmin` y `completeOnboardingViaUi` suponen el onboarding de hoy. Para cubrir el
   flujo nuevo con e2e hay que poder crear una sesión de Cognito en el entorno de pruebas, y hoy eso no
   está definido.

---

## 12. Riesgos

- **[Riesgo] Dos pantallas más que hoy.** «Tus datos» lo exige el registro nuevo, y «Tu plan» lo
  eligió el humano el 9 de noviembre de 2026 frente a crear Gratis sin pantalla, aunque en la beta
  sólo deja elegir Gratis. **[Supuesto]** Cada pantalla extra en el celular aumenta el abandono. Lo
  compensa en parte que el horario ya no obligue a ir y volver del panel (r-6 de primer-uso). Se mide
  con los criterios 3 y 4.
- **[Riesgo] Planes que se ven y no se pueden elegir.** El médico ve los precios de Consultorio, Clínica
  y Red, pero no tiene cómo pedir uno: la frase de la beta no dice a quién. Es la misma pregunta
  abierta P1 de `beta-free-plan-only`, que no resuelve este PRD.
- **[Riesgo] Un nombre aceptado sin pensar, que después no se puede cambiar.** El nombre prellenado se
  acepta con un toque, y hoy ni el nombre ni la dirección del consultorio se editan. Los pacientes los
  ven desde el primer día. Lo resuelve «Renombrar sede» (WIZ-79), que va justo después y también en
  `backend-infra` (sección 14). **[Supuesto]** Estará listo cuando el onboarding llegue a los
  usuarios, porque el paso al backend nuevo espera al booking y la autogestión, que van después en la
  migración.
- **[Riesgo] Clínicas con sedes:** la primera sede se llama igual que la organización (sección 3.2).
- **[Riesgo] Definir el horario en el celular, entre consultas.** El editor puede ser largo, y el médico
  quizá no tiene su horario a mano. Puede omitirlo con «Lo hago después», y la guía se lo vuelve a
  pedir. Si cierra la app sin omitirlo, vuelve a «Tu horario» y no entra al panel hasta pulsar uno de
  los dos botones.
- **[Riesgo, aceptado en primer-uso r-3] El dueño que no atiende** (por ejemplo, el gerente de una
  clínica) tiene que escribir una especialidad, y la guía le aparece siempre.
- **[Riesgo, aceptado el 9 de noviembre de 2026] El beneficio llega recién con el backend nuevo.**
  Hasta entonces, quien se registra en el api de hoy sigue con el onboarding de primer-uso, sin el
  horario ni el nombre prellenado. A cambio, no se construye dos veces.

---

## 13. Documentos que cambian

Se cambian en un PR `docs:` aparte, cuando la feature ya esté mergeada:

| Documento | Cambio |
| --- | --- |
| `docs/PRODUCT.md`, «Estado › Primer uso» | El onboarding tiene cuatro pasos: tus datos, tu plan (sólo Gratis durante la beta), tu consultorio y el horario, este último opcional. La cuenta se crea al confirmar el registro, sin plan. |
| `docs/capacidades.md` | La fila del onboarding. |
| `docs/legal/politica-privacidad.md`, A.1, A.2 y A.4 | **Va en WIZ-80, que tiene que estar antes de publicar el onboarding nuevo**, y no en el PR `docs:` de después del merge. Se valida con un abogado junto con WIZ-56. El nombre, el apellido y el celular se dan en el onboarding, después del registro, y el celular es obligatorio. Su finalidad, el soporte y los avisos de la cuenta, va entre las de A.2 (sección 4.2). Como la cuenta no tiene nombre, «Nombre de la cuenta» sale de A.1. «Plan contratado y estado de la suscripción» ya no viene «al crear la cuenta», sino de «Tu plan». |
| `platform/e2e/README.md` | Sólo si cambia cómo se corren o se escriben las pruebas (prerrequisito 9). |

---

## 14. Decisiones del humano

Tomadas el 9 de noviembre de 2026, sobre las preguntas de la v1, el prerrequisito 3, las propuestas
de la v2 (filas 7 a 9) y lo que el humano agregó ese mismo día (filas 10 y 11). La fila 12 es del 12
de noviembre de 2026. La fila 10 cambia la
1, la 2 y la 6: hoy son cuatro pasos y la cuenta nace sin plan.

| # | Pregunta | Decisión | Dónde se refleja |
| --- | --- | --- | --- |
| 1 | ¿Qué versión del onboarding? | **B**, la intermedia: tus datos → tu consultorio → tu horario. | Resumen y secciones 3 y 4. |
| 2 | ¿El paso «Invitar» entra en esta feature? | **No.** Se sigue invitando desde Usuarios, como hoy. Quedaban tres pasos: «Tus datos» (obligatorio), «Tu consultorio» (obligatorio, con el nombre prellenado) y «Tu horario» (opcional); con la fila 10 son cuatro. | Secciones 4, 5, 6 y 9, pv-3 y prerrequisito 7. Se quitó el criterio de éxito del uso del paso. |
| 3 | ¿El celular del médico es obligatorio? | **Sí.** La política de privacidad tiene que decir la finalidad, y hay que validarlo con un abogado. | Sección 4.2, pv-1, pv-4 y sección 13. |
| 4 | ¿Se prioriza «Renombrar sede»? | **Sí, justo después del onboarding,** en WIZ-79 («Edit the clinic name and address»), bloqueado por WIZ-77: editar el nombre y la dirección del consultorio desde el panel. | Resumen y secciones 3.2, 5, 9 y 12. |
| 5 | ¿Cuándo sale? | **Con el registro nuevo y la sesión de Cognito.** El onboarding del registro nuevo se construye en `backend-infra`, porque los usuarios nuevos viven en Cognito y DynamoDB, y el api de Railway nunca va a aceptar su sesión (decidido el 8 de noviembre de 2026, WIZ-78). No se hace primero sobre el api de hoy. | Secciones 6, 7 y 12, y prerrequisitos 1, 2, 4 y 8. |
| 6 | ¿Dónde y cuándo se crea la cuenta (el tenant)? | **Al confirmar el registro,** sin nombre y sin plan, con el usuario como dueño, en la segunda spec de WIZ-78. El plan lo crea «Tu plan» (fila 10). «Tu consultorio» crea la organización y la sede dentro de esa cuenta, con el dueño como administrador y como médico de la sede, con su especialidad. La cuenta no tiene nombre. | Resumen, secciones 4.1, 4.4, 7 y 13, y prerrequisitos 3 y 5. |
| 7 | ¿Se quita el modo «Termina de crear tu consultorio» (D-3 de primer-uso)? | **Sí.** En el backend nuevo toda cuenta nace sin organización, y las cuentas de la beta no se migran, así que nadie lo usaría. | Secciones 4.4 y 6. |
| 8 | ¿Cuál es la finalidad del celular? | **Soporte y avisos de la cuenta, sin novedades comerciales.** Aprobada como tarea, no para ahora: va en WIZ-80, que cambia la política de privacidad y se valida con un abogado junto con WIZ-56. Tiene que estar antes de publicar el onboarding nuevo. | Resumen, sección 4.2, pv-1 y sección 13. |
| 9 | ¿«Renombrar sede» se construye en `backend-infra`? | **Sí,** «en un futuro cercano»: es WIZ-79. | Resumen y secciones 9 y 12. |
| 10 | ¿El onboarding pide el plan, o crea Gratis sin pantalla, como hoy? | **Con su pantalla, «Tu plan»,** obligatoria, entre «Tus datos» y «Tu consultorio». Muestra los cuatro planes de `platform/src/lib/plans.ts`, con Gratis elegido y los de pago deshabilitados con el aviso de la beta. El backend sólo acepta Gratis mientras dure la beta, como exige `beta-free-plan-only`. Queda lista para cuando vuelva el cobro con Culqi, que está fuera de alcance. Quedan cuatro pasos: Tus datos → Tu plan → Tu consultorio → Tu horario (opcional). | Resumen y secciones 4, 5, 6, 7, 9, 10, 12 y 13, y prerrequisitos 1, 3, 4 y 5. |
| 11 | ¿Dónde viven los datos personales? | **Sólo en DynamoDB, en el ítem del usuario,** no en Cognito. | Prerrequisito 2. |
| 12 | ¿Cuándo termina el onboarding? (12 de noviembre de 2026) | **En el paso 4, «Tu horario»,** al guardar el horario o al pulsar «Lo hago después», y no al crear el consultorio. Si cierra la app en «Tu horario», la próxima vez vuelve a ese paso hasta que lo guarde o lo omita. El paso sigue siendo opcional, con sus dos botones. El paso en que va cada persona se guarda en el usuario; cómo, lo decide el plan. Reemplaza mi propuesta de que terminara al crear el consultorio. | Secciones 4.1, 4.5, 4.6, 5, 6, 7, 10 y 12, y prerrequisitos 1 y 5. |

---

## Fuentes

- Ley 29733, Ley de Protección de Datos Personales, art. 7 (principio de proporcionalidad), en LP
  Derecho (consultado el 8 de noviembre de 2026):
  https://lpderecho.pe/ley-proteccion-datos-personales-ley-29733-actualizada/ y en vLex:
  https://vlex.com.pe/vid/ley-n-29733-ley-578578822. Hay que verificar el texto vigente en El Peruano
  antes de citarlo en la política.
- Del repositorio:
  - `docs/PRODUCT.md`, `docs/features/primer-uso/plan.md`, `docs/features/tope-citas-mes/prd.md`
    (d-15 y k-7) y `docs/features/beta-free-plan-only/plan.md` (sólo Gratis durante la beta y su P1);
  - `platform/src/lib/plans.ts` (los cuatro planes y sus textos) y
    `platform/src/app/(auth)/onboarding/onboarding-form.tsx` (el campo oculto `plan` y la frase de la
    beta);
  - `docs/legal/politica-privacidad.md`;
  - `backend-infra/docs/spec/sign-up-code/spec.md`, `backend-infra/docs/spec/sign-up/spec.md` y
    `backend-infra/docs/spec/sign-in/spec.md` («Fuera de alcance»: la cuenta al confirmar el registro
    va en la segunda spec de WIZ-78);
  - `backend-infra/lib/src/users/domain/user.entity.ts` y `value-objects/phone.vo.ts`;
  - `api/src/application/use-cases/account/create-first-clinic.usecase.ts` y
    `complete-account-setup.usecase.ts`, y `platform/src/lib/actions/account/create-account.action.ts`,
    que le pone a la cuenta el nombre del consultorio;
  - `api/src/infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts`;
  - `api/prisma/schema.prisma` (`Availability` sin `created_at`);
  - `platform/src/app/(auth)/onboarding/` y `platform/src/lib/auth/onboarding-mode.ts`;
  - `platform/src/components/profile/personal-data-card.tsx` (el tratamiento y «Así te ven tus
    pacientes al reservar»);
  - `platform/src/app/clinic/[clinicId]/create-appointment/booking-header.tsx`.
