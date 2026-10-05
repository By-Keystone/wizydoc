# Competidores de WizyDoc en Perú

> Estudio de mercado, solo para Perú. Fecha de consulta de todas las fuentes web: **2026-10-03**.
> Autor: agente PM. Es un documento de investigación: **no es una decisión de producto**. Las decisiones de precio, posicionamiento y alcance son del humano.

## Cómo leer este documento

Cada dato lleva una de estas marcas:

- **[V] Verificado**: lo leí en la página oficial del competidor (o en el código de WizyDoc) en la fecha de consulta.
- **[S] Fuente secundaria**: sale de un tercero (prensa, comparador, blog de un competidor). Puede estar desactualizado o sesgado.
- **[I] Inferido**: es mi interpretación o una suposición. Hay que validarlo antes de decidir nada con ello.

Conversión a USD: **1 USD = S/ 3,436** (cierre BCRP del 2026-10-02, según [Infobae](https://www.infobae.com/peru/2026/10/02/dolar-hoy-en-peru-cotizacion-de-apertura-del-2-de-octubre/)). Los competidores que cobran en USD en Perú se muestran en USD con su equivalente aproximado en soles. **No he convertido precios de otros países como si fueran peruanos.** Cuando un competidor no publica precio para Perú, lo indico.

Ninguna fuente aclara si los precios incluyen IGV (18 %), salvo donde se indique.

---

## 1. Resumen ejecutivo

1. **El mercado peruano de agenda médica online está ocupado, pero fragmentado.** Hay presencia verificada de un marketplace global (Doctoralia), de una startup peruana enfocada en dental y médico (Doctocliq), de un SaaS regional de agendamiento (AgendaPro), de EMR modulares (Nimbo, Dentalink) y de varias herramientas genéricas de turnos (Turnito, ReservaSimple). Ninguno se presenta solo como "booking directo sin intermediarios": todos venden la agenda junto con historia clínica, marketing o marketplace.
2. **En el núcleo de su tesis, WizyDoc está por detrás de sus competidores directos.** En el código actual el paciente **no puede cancelar ni reprogramar por su cuenta**: el correo de confirmación le pide llamar a la clínica (`api/src/infrastructure/services/email-service/templates/confirm-appointment.mjml`, línea 39) y no existe ningún endpoint que cambie el estado de una cita. Doctoralia [V] y Doctocliq [V] ya permiten confirmar, cancelar o reprogramar desde un link o desde WhatsApp, y AgendaPro y Reservo dicen hacerlo [V, según su propia web].
3. **Los recordatorios por WhatsApp son estándar en Perú** y WizyDoc los tiene fuera de alcance. Doctocliq, AgendaPro (como add-on pago), Doctoralia, Nimbo, Dentalink, Turnito y ReservaSimple los ofrecen. En Perú, el 98,6 % de quienes usan mensajería instantánea usan WhatsApp ([Osiptel, Erestel 2025, vía La República](https://especial.larepublica.pe/peru-conectado/2026/2026/06/02/whatsapp-y-yape-se-consolidan-como-las-plataformas-mas-usadas-por-los-peruanos-segun-encuesta-de-osiptel-87862)).
4. **En precio, WizyDoc está bien posicionado frente a Doctoralia y Doctocliq, pero AgendaPro es una amenaza en clínicas.** El plan Consultorio de WizyDoc (S/ 79/mes, 3 médicos) cuesta menos de la mitad que el Starter de Doctoralia (S/ 199,17/mes con pago anual y permanencia). Pero el plan Básico de AgendaPro Perú cuesta **S/ 99/mes para hasta 20 profesionales**, frente a los S/ 199/mes para 8 médicos del plan Clínica de WizyDoc.
5. **El plan gratis de WizyDoc no tiene tope de citas** [V, en código], mientras que los planes gratis de la competencia sí lo tienen: Doctocliq, 30 al mes; Turnito, 100 al mes; ReservaSimple, 30 al mes. Es un diferenciador real para el médico independiente.
6. **WizyDoc no tiene marketplace** y depende de que el médico difunda su link. Doctoralia, AgendaPro y AgendarDoctor venden visibilidad ante pacientes [I: es una diferencia de modelo, no necesariamente una debilidad].

**Recomendación principal (para que decida el humano):** antes de competir en funciones, cerrar el hueco de la tesis, es decir, que el paciente pueda **cancelar y reprogramar desde el link del correo sin cuenta**. Después, evaluar los recordatorios por WhatsApp, que hoy están fuera de alcance según `docs/PRODUCT.md`. Las opciones se detallan en la sección 5.

---

## 2. Tabla comparativa

### 2.1 Precios (Perú)

| Producto | Origen | Presencia en Perú | Modelo de cobro | Plan gratis / prueba | Precio de entrada | Precio para una clínica pequeña | Fuente |
|---|---|---|---|---|---|---|---|
| **WizyDoc** | Perú | Sí (mercado inicial) | Por plan (médicos y sedes incluidos) + add-ons. Mensual, sin permanencia | Gratis para siempre: 1 médico, 1 sede, **sin tope de citas** | Consultorio S/ 79/mes (~USD 23), 3 médicos | Clínica S/ 199/mes (~USD 58), 8 médicos y 3 sedes | [V] `api/src/domain/entities/subscription/plan.ts`, `web/src/components/marketing/pricing.tsx` |
| **Doctoralia** (Docplanner) | España (global) | Sí, verificada | Por profesional; **solo pago anual con permanencia** | Perfil gratuito (sin agenda pro) | Starter S/ 199,17/mes (~USD 58), pago anual | Precio para clínicas no publicado | [V] [pro.doctoralia.pe/precios](https://pro.doctoralia.pe/precios) |
| **Doctocliq** | **Perú** (Lima, 2019) | Sí, verificada | Por plan; cobra en **USD** | Gratis para siempre con 30 citas o pacientes al mes | Individual USD 19/mes (~S/ 65) | Avanzado USD 49/mes (~S/ 168); número de doctores "según contrato" | [V] [doctocliq.com/planes-y-precios](https://www.doctocliq.com/planes-y-precios) |
| **AgendaPro** | Chile (regional) | Sí, verificada (web `/pe` en soles) | Por plan (tope de profesionales). WhatsApp y video como add-ons | Prueba gratis (no se indica la duración en la página de Perú) | Individual S/ 59/mes (~USD 17), 1 profesional | Básico S/ 99/mes (~USD 29), **hasta 20 profesionales**; Premium S/ 149/mes | [V] [agendapro.com/pe/planes](https://agendapro.com/pe/planes) |
| **Nimbo** (Ecaresoft) | México | Sí (web `/pe`) | Modular, por módulo | Prueba de 14 días | **No publica precio para Perú** | No publica | [V] [nimbo-x.com/pe](https://www.nimbo-x.com/pe), [nimbo-x.com/precios](https://www.nimbo-x.com/precios) |
| **Dentalink** (Healthatom) | Chile | Sí (landing para Perú) | Planes Basic, Pro y Titanium | Demo | **No publica precio** | No publica | [V] [contenido.softwaredentalink.com/conoce-dentalink-peru](https://contenido.softwaredentalink.com/conoce-dentalink-peru) |
| **Alaz** | Perú | Sí | No publicado | Demo gratuita | **No publica precio** | No publica | [V] [alaz.pe/software-clinicas-peru](https://alaz.pe/software-clinicas-peru) |
| **OdontoSoft** | Perú (dental) | Sí | Pago único | Gratis hasta 30 pacientes | S/ 349 (pago único) | No aplica | [S] blog del propio OdontoSoft: [odontosoft.me](https://odontosoft.me/blog/cuanto-cuesta-software-dental-peru/) |
| **Turnito** (genérico) | Latam, sin país de origen explícito | Sí (web `/pe`, cobro en soles vía MercadoPago) | Suscripción en USD + **comisión sobre cobros** | Gratis: 5 % de comisión y tope de 100 reservas/mes [S] | Plus USD 8/mes (~S/ 27), 3,5 % de comisión | Pro USD 30/mes (~S/ 103), 0 % de comisión | [V] [turnito.app/pe](https://turnito.app/pe/) |
| **ReservaSimple** (genérico) | Latam y España | Sí (landings para Perú) | Suscripción en USD, sin comisión | Gratis con 30 reservas/mes | Premium USD 13,99/mes (~S/ 48) | No aplica | [V] [reservasimple.com](https://www.reservasimple.com/app-reservas-ginecologia-peru) |
| **AgendarDoctor** | Perú (marketplace) | Sí | No publicado | No indicado | **No publica precio** | No publica | [V] [agendardoctor.com/para-doctores](https://www.agendardoctor.com/para-doctores) |
| **Calendly** (sustituto) | EE. UU. | Global, sin presencia local | Por usuario, en USD | Gratis con 1 tipo de evento | Standard USD 10/mes (USD 8,30 con pago anual) | Teams USD 16/usuario/mes | [V] [calendly.com/pricing](https://calendly.com/pricing) |
| **Google Calendar** (sustituto) | EE. UU. | Global | Gratis o Workspace | 1 página de reservas gratis | Funciones premium solo con Workspace o Google One | No aplica | [V] [Google Calendar Help](https://support.google.com/calendar/answer/16287038?hl=en) |
| **WhatsApp Business** (sustituto) | EE. UU. (Meta) | Global, dominante en Perú | App gratis; la API cobra por mensaje | App gratis | USD 0 (agenda manual) | Tarifas de la API en la sección 4.3 | [V] [developers.facebook.com](https://developers.facebook.com/docs/whatsapp/pricing) |

### 2.2 Funcionalidades

Leyenda: Sí = lo afirma la fuente oficial. No = la fuente oficial lo excluye o el código no lo tiene. ? = no lo pude verificar.

| Producto | Booking self-service 24/7 | El paciente cancela o reprograma sin llamar | Recordatorios WhatsApp/SMS | Historia clínica | Pagos del paciente | Teleconsulta | Marketplace de pacientes | Facturación SUNAT |
|---|---|---|---|---|---|---|---|---|
| **WizyDoc** | Sí, sin cuenta [V] | **No**: el correo dice "comunícate con la clínica" [V] | **No** (solo correo de confirmación) [V] | Ficha de paciente con historial de citas, **sin notas clínicas** (fuera de alcance) [V] | No (fuera de alcance) [V] | No [V] | No [V] | No encontrado en el código [V] |
| Doctoralia | Sí [V] | Sí [V en pro.doctoralia.pe; el detalle del flujo, en las páginas de ES/MX] | SMS (300 a 5.000/mes según plan) y WhatsApp [V] | "Episodios clínicos" desde el plan Plus [V] | Pagos online [V] | Desde el plan Plus [V] | **Sí** (su principal argumento) [V] | ? |
| Doctocliq | Sí, "sin intermediarios" [V] | **Sí**, desde WhatsApp o el link del correo [V] | WhatsApp, 50 a 150/mes según plan [V] | Sí, incluso en el plan gratis [V] | Caja y presupuestos [V]; ¿cobro online? ? | ? | No [I] | Add-on, Perú incluido [V] |
| AgendaPro | Sí [V] | "Cambios y cancelaciones reflejados al instante" [V]; el flujo del paciente no está detallado | WhatsApp (add-on desde S/ 17/mes por 50 mensajes), SMS y correo [V] | Fichas personalizables [V]; en reseñas la critican por genérica [S] | Pagos en línea [V] | Add-on desde S/ 37/mes [V] | Sí ("presencia en Marketplace") [V] | ? |
| Nimbo | Portal de citas en línea [V] | ? | WhatsApp, SMS y correo [V] | Sí, es su núcleo [V] | Facturación [V]; ¿cobro online? ? | Sí [V] | No [I] | ? |
| Dentalink | ? | ? | WhatsApp y correo [V] | Sí (odontograma) [V] | Pagos y convenios [V] | ? | No [I] | La refieren al área comercial [V] |
| Alaz | Sí (web, app y WhatsApp) [V] | "Gestión de cancelaciones" [V]; flujo no detallado | Sí [V] | Sí, CIE-10 y firma digital [V] | ? | Sí [V] | No [I] | Sí, además de SUSALUD [V] |
| Turnito | Sí [V] | ? | WhatsApp (100 a 250/mes en planes pagos) [S/V] | No (solo historial del cliente) [V] | Sí, MercadoPago o PayPal, con comisión [V] | Google Meet [V] | No [I] | No [I] |
| ReservaSimple | Sí, link sin app [V] | No mencionado [V] | WhatsApp y correo 24 h antes [V] | **No**, lo excluye explícitamente [V] | MercadoPago, sin comisión [V] | ? | No [I] | No [I] |
| AgendarDoctor | Sí [V] | ? | Recordatorios y confirmaciones [V] | ? | Pago anticipado opcional [V] | Sí [V] | **Sí** [V] | ? |
| Calendly | Sí [V] | Sí, con política de cancelación configurable [V] | ? (no figura en la página de precios) | No | Stripe o PayPal (plan Standard o superior) [V] | Integraciones de videollamada [I] | No | No |
| Google Calendar | Sí, 1 página gratis [V] | ? | Correo, solo en premium [V] | No | Stripe, solo en premium [V] | Meet [I] | No | No |

---

## 3. Fichas por competidor

### 3.1 Doctoralia (Docplanner)

- **Propuesta de valor [V]:** perfil del especialista en el marketplace más visitado y software de agenda. Promete "ahorre hasta 10 horas semanales" y un 40 % menos de llamadas. Dice tener más de 26.000 especialistas y 300.000 visitas de pacientes en Perú ([pro.doctoralia.pe](https://pro.doctoralia.pe/)). *Nota: esas cifras las publica Doctoralia y no las pude contrastar.*
- **Presencia en Perú [V]:** dominio propio, [doctoralia.pe](https://www.doctoralia.pe/), y una app en la App Store de Perú.
- **Precios Perú [V]** ([pro.doctoralia.pe/precios](https://pro.doctoralia.pe/precios)):
  | Plan | Precio | USD aprox. | Incluye |
  |---|---|---|---|
  | Starter | S/ 199,17/mes, cargo anual | ~58 | Calendario, recordatorios por correo y push, 300 SMS de campañas al mes |
  | Plus | S/ 249,17/mes, cargo anual | ~73 | + episodios clínicos, recordatorios SMS, videoconsulta, 1.000 SMS/mes |
  | VIP | S/ 299,17/mes, cargo anual | ~87 | + perfil destacado, lista de espera, envíos masivos, 5.000 SMS/mes |
  | Web profesional (add-on) | S/ 55/mes, cargo anual | ~16 | Página web propia |
  - Cobro **por especialista**, **solo anual** y **con permanencia**. Tiene perfil gratuito. Los precios para clínicas no son públicos.
- **Funcionalidades:** booking 24/7, recordatorios por SMS y WhatsApp, cancelación y reprogramación por el paciente, teleconsulta, pagos online e historia clínica básica [V en la home de Perú]. Que el paciente confirme, cancele o reprograme desde SMS, WhatsApp, correo o la app está documentado en las páginas de España y México ([pro.doctoralia.es](https://pro.doctoralia.es/productos/funcionalidades/recordatorio-y-confirmacion-de-cita-automatico), [pro.doctoralia.com.mx](https://pro.doctoralia.com.mx/productos/funcionalidades/mensajes-automaticos-de-confirmacion-y-recordatorios)). [I] Es probable que funcione igual en Perú, pero no lo comprobé en un flujo real.
- **Ventajas:** captación de pacientes (marketplace y opiniones), marca reconocida y producto maduro.
- **Desventajas:** es el más caro de los que publican precio; exige pago anual y permanencia. El paciente reserva *dentro de Doctoralia*, junto a otros médicos [I: para el médico eso es dependencia de la plataforma].
- **Quejas recurrentes [S, no específicas de Perú]:** dificultad para cancelar la suscripción por la permanencia anual y médicos que pagaron un año sin recibir pacientes ([OCU, España](https://www.ocu.org/reclamar/empresas/doctoralia/c171c484f900cca285); [tuquejasuma.com](https://tuquejasuma.com/doctoralia)). No encontré reseñas equivalentes de médicos peruanos.

### 3.2 Doctocliq

- **Propuesta de valor [V]:** "El mejor software dental y médico de Latinoamérica". Ofrece agenda, historia clínica, finanzas y marketing en una sola plataforma, y promete que los pacientes "reservan sin intermediarios".
- **Origen y presencia [S]:** startup **peruana**, fundada en Lima en 2019 por Paul Mendoza, Kristty Huamaní y Víctor Murillo. Fue cofinanciada con S/ 150.000 por ProInnóvate (Startup Perú 8G+) y tiene un convenio con el Colegio Odontológico del Perú ([Andina](https://andina.pe/agencia/noticia-peruanos-desarrollan-software-contribuye-a-mejorar-gestion-consultorios-medicos-909865.aspx), [Infomercado](https://infomercado.pe/doctocliq-el-software-creado-por-tres-peruanos-ahora-esta-presente-en-12-paises-290922-cch/), [Gestión](https://gestion.pe/economia/empresas/startup-tras-afianzarse-en-el-rubro-dental-startup-doctocliq-va-detras-de-consultorios-esteticos-noticia/), [doctocliq.com/doctocliq-cop](https://www.doctocliq.com/doctocliq-cop)). Según la prensa, cerca del 80 % de su cartera son dentistas [S]. Hoy declara más de 3.000 doctores en 13 países [S].
- **Precios [V]** ([doctocliq.com/planes-y-precios](https://www.doctocliq.com/planes-y-precios)). **En USD, sin precio en soles:**
  | Plan | USD/mes | S/ aprox. | Incluye |
  |---|---|---|---|
  | Gratis | 0 | 0 | 1 doctor, tope de 30 al mes, agenda, booking online e historia clínica |
  | Individual | 19 | ~65 | 1 doctor, 50 pacientes al mes, 1 GB, 50 recordatorios de WhatsApp al mes |
  | Básico | 29 | ~100 | Pacientes ilimitados, 5 GB, caja, consentimientos, firma electrónica, 100 WhatsApp al mes |
  | Avanzado | 49 | ~168 | + inventario, 150 WhatsApp al mes |
  - Con pago anual regala 2 meses; la promoción vigente es de 25 % para nuevos clientes en pago semestral o anual. La facturación electrónica para Perú es un add-on. El número de doctores en Básico y Avanzado es "según contrato" [V].
  - *Discrepancia:* el tope del plan gratis figura como "30 citas" en una página y como "30 pacientes al mes" en otra. No lo pude resolver.
- **Funcionalidades [V]** ([agenda médica digital](https://www.doctocliq.com/funcionalidades/agenda-medica-digital)): booking 24/7, recordatorios por WhatsApp o correo 1 o 3 días antes, y el paciente puede **confirmar, cancelar o reagendar desde el mensaje** sin app. Las cancelaciones quedan registradas. También ofrece un chatbot de IA para WhatsApp ("Soyla"), un módulo de marketing y app móvil. No pude verificar si usa la API oficial de WhatsApp.
- **Ventajas:** es peruano, tiene un plan gratis con historia clínica, cubre de punta a punta el flujo de cancelar y reprogramar, y su precio de entrada es bajo.
- **Desventajas:** cobra en USD, su foco es dental y los créditos de WhatsApp vienen con tope.
- **Quejas [S, publicadas por el propio Doctocliq, sesgo alto]:** curva de adaptación, la app móvil a veces se cuelga y algunas funciones solo existen en México, Perú y Ecuador ([blog de Doctocliq](https://www.doctocliq.com/blog/vale-la-pena-doctocliq-pros-contras)). No encontré reseñas independientes.

### 3.3 AgendaPro

- **Propuesta de valor [V]:** software de gestión para negocios de servicios (salud, belleza y bienestar). En Perú se presenta como "Software para centro médico #1 en Perú" y dice tener más de 135.000 profesionales en total ([agendapro.com/pe](https://agendapro.com/pe/centro-medico/software-para-centro-medico)).
- **Presencia en Perú [V]:** sitio `/pe` con precios en soles.
- **Precios Perú [V]** ([agendapro.com/pe/planes](https://agendapro.com/pe/planes)):
  | Plan | S/ al mes | USD aprox. | Profesionales | Incluye |
  |---|---|---|---|---|
  | Individual | 59 | ~17 | 1 | Agenda online ilimitada, presencia en el marketplace, CRM, recordatorios, 500 correos de marketing |
  | Básico | 99 | ~29 | Hasta 20 | + inventario, comisiones, 1.000 correos |
  | Premium | 149 | ~43 | Hasta 20 | + fichas personalizables, encuestas, giftcards, presupuestos, sitio web |
  | Pro | 449 | ~131 | Hasta 20 | + API, Google Analytics/Meta Pixel, soporte personalizado |
  | Add-on WhatsApp | desde 17 | ~5 | No aplica | 50 mensajes al mes |
  | Add-on videoconferencia | desde 37 | ~11 | No aplica | 2.500 minutos |
  - 20 % de descuento con pago anual y prueba gratis en todos los planes.
- **Funcionalidades [V]:** reserva 24/7, "cambios y cancelaciones reflejados al instante", recordatorios por WhatsApp, SMS o correo, fichas clínicas personalizables, pagos en línea y videollamada.
- **Ventajas:** precio muy competitivo para equipos de hasta 20 profesionales, precios en soles y un producto maduro con marketplace.
- **Desventajas:** es un producto horizontal, no exclusivo de salud. WhatsApp y video se pagan aparte.
- **Quejas recurrentes [S]** ([Capterra](https://www.capterra.com/p/218709/AgendaPro/reviews/), [Medesk](https://www.medesk.net/es/blog/agenda-pro-review/)): WhatsApp se cobra aparte, la ficha clínica es "general, no adaptada al sector médico", sube precios mientras recorta funciones, los pagos online tardan unos 2 días en reflejarse y la app es lenta. Rating de 4,8 en Capterra [S]. Las reseñas no son específicas de Perú.

### 3.4 Nimbo (Ecaresoft)

- **Propuesta de valor [V]:** expediente o historia clínica electrónica modular, con agenda, receta electrónica, telemedicina, facturación e inventario. Dice tener más de 16.000 médicos y 350 empresas en 25 países ([nimbo-x.com/pe](https://www.nimbo-x.com/pe)).
- **Presencia en Perú [V]:** landing `/pe`. El origen es México [S: [OdontoSoft](https://odontosoft.me/blog/cuanto-cuesta-software-dental-peru/)].
- **Precios:** **no publica precio para Perú**; la página de precios lleva a un formulario [V]. Las cifras en MXN o USD de otros sitios **no se usan aquí** por ser de otro mercado.
- **Funcionalidades [V]:** portal de citas online, recordatorios por WhatsApp, SMS o correo, sincronización con Google Calendar, teleconsulta y prueba de 14 días. No pude verificar si el paciente puede cancelar o reprogramar.
- **Ventajas:** historia clínica fuerte y producto modular. **Desventajas:** no tiene precio transparente en Perú [I: es más pesado para un médico independiente que solo quiere agenda].

### 3.5 Dentalink (Healthatom, el mismo grupo que Medilink)

- **Propuesta de valor [V]:** software dental con agenda, historia clínica, odontograma, presupuestos, convenios y recordatorios por WhatsApp ([landing Perú](https://contenido.softwaredentalink.com/conoce-dentalink-peru)).
- **Presencia en Perú [V]:** tiene una landing específica para Perú, pero no encontré dirección ni teléfono local.
- **Precios:** **no publicados**; ofrece demo [V]. Las cifras de "USD 29 a 35 al mes" que circulan vienen de blogs de terceros [S] y no las verifiqué.
- Nicho dental; no compite con WizyDoc en medicina general [I].

### 3.6 Alaz

- **Propuesta de valor [V]:** sistema de gestión peruano para clínicas y centros de salud. Incluye HCE con CIE-10 y firma digital, agenda online (web, app y WhatsApp), farmacia, facturación SUNAT, reportes para SUSALUD, cumplimiento de la Ley 29733 y telemedicina ([alaz.pe](https://alaz.pe/software-clinicas-peru)).
- **Precios:** **no publicados**; se accede por demo [V].
- Es el más cercano a un **EMR/HIS local**. Apunta a clínicas con cumplimiento regulatorio, no al médico que quiere salir de WhatsApp [I].

### 3.7 OdontoSoft

- Software dental peruano. Según **su propio blog** [S]: gratis hasta 30 pacientes, o un pago único de S/ 349, con facturación SUNAT y funcionamiento offline ([odontosoft.me](https://odontosoft.me/blog/cuanto-cuesta-software-dental-peru/), 9 de mayo de 2026). No verifiqué su página de precios ni sus funciones de booking. Lo incluyo como referencia de precio local bajo.

### 3.8 Turnito

- **Propuesta de valor [V]:** app de turnos gratis y genérica (salones, centros médicos, psicólogos, gimnasios). En Perú cobra en soles vía MercadoPago o transferencia ([turnito.app/pe](https://turnito.app/pe/)).
- **Precios [V]** (en USD): Gratis, con 5 % de comisión sobre cobros; Plus, USD 8/mes con 3,5 %; Advance, USD 18/mes con 1 %; Pro, USD 30/mes con 0 %. Según una fuente secundaria [S] ([búsqueda / turnito.app](https://turnito.app/)), el plan gratis tiene un tope de 3 agendas y 100 reservas al mes, y Advance y Pro incluyen 100 y 250 recordatorios de WhatsApp al mes.
- **Funcionalidades [V]:** WhatsApp, Google Calendar, pagos online, reservas recurrentes y Google Meet. No tiene historia clínica.
- **Ventajas:** precio muy bajo y comisión opcional. **Desventajas:** no es específico de salud y no tiene ficha clínica.
- *Nota:* el ranking de "mejores software para odontólogos en Perú" que publica Turnito ([blog](https://turnito.app/blog/los-mejores-software-de-reservas-para-odontologos-en-peru-2026/)) es contenido de un competidor; no lo uso como fuente de precios de terceros.

### 3.9 ReservaSimple

- **Propuesta de valor [V]:** reservas online genéricas, sin comisión. Dice atender a más de 4.800 negocios en Latam y España, fue fundada en 2024 y tiene landings para Lima, Arequipa, Trujillo y Cusco ([reservasimple.com](https://www.reservasimple.com/app-reservas-ginecologia-peru)).
- **Precios [V]:** Gratis, con 30 reservas al mes; Premium, USD 13,99/mes (~S/ 48) con reservas ilimitadas.
- **Funcionalidades [V]:** recordatorios por WhatsApp y correo 24 h antes, MercadoPago sin comisión. **Excluye explícitamente la historia clínica.** No menciona cancelación por parte del paciente.
- [I] Las landings por ciudad parecen sobre todo SEO; no encontré pruebas de clientes peruanos concretos.

### 3.10 AgendarDoctor

- **Propuesta de valor [V]:** marketplace peruano para reservar citas "sin llamar". Muestra disponibilidad a 14 días, consultas presenciales o virtuales, pago anticipado opcional, recordatorios y enlace automático de videoconsulta ([para pacientes](https://www.agendardoctor.com/para-pacientes), [para doctores](https://www.agendardoctor.com/para-doctores)).
- **Precios:** **no publicados**. El alta es por formulario y se activa en 24 a 72 h [V].
- [I] Su tamaño y tracción son desconocidos. Compite en captación más que en software.

### 3.11 Con presencia en Perú no confirmada (nota breve)

- **Medilink** (Healthatom, Chile): declara clientes en Perú [S, [comparasoftware.pe](https://www.comparasoftware.pe/medilink)], pero su página de planes no muestra precios y solo lista teléfonos de Chile, Colombia y México [V, [softwaremedilink.com/planes](https://www.softwaremedilink.com/planes)]. **Ojo:** `medilinkperu.com` es una empresa homónima sin relación (servicios a asegurados).
- **Reservo** (Chile): su web tiene un selector de país que incluye Perú [V, [reservo.cl/homepage/pe/salud](https://reservo.cl/homepage/pe/salud/)] y dice ofrecer booking, cancelación y reprogramación por el paciente, confirmación por WhatsApp y pagos. No encontré precios para Perú ni pruebas de clientes locales. Parece un regional que está entrando a Perú [I].
- **Encuadrado** (Chile, salud mental): no encontré evidencia de operación en Perú; sus precios están en moneda chilena. **Excluido.**
- **MediCloud.me, Medesk, Clinic Cloud:** aparecen en comparadores peruanos [S] pero no verifiqué que operen en el país. Excluidos.

---

## 4. Sustitutos e indirectos en Perú

### 4.1 WhatsApp Business con agenda manual

- **Es el sustituto real y el "competidor" de la tesis de WizyDoc.** El 98,6 % de los usuarios de mensajería en Perú usan WhatsApp ([Osiptel, Erestel 2025](https://especial.larepublica.pe/peru-conectado/2026/2026/06/02/whatsapp-y-yape-se-consolidan-como-las-plataformas-mas-usadas-por-los-peruanos-segun-encuesta-de-osiptel-87862)).
- **Costo:** la app WhatsApp Business es gratis. El costo real es el tiempo de recepción y las reservas que no se responden fuera de horario [I, coherente con el "Problema" de `docs/PRODUCT.md`].
- **API oficial (relevante si WizyDoc envía recordatorios) [V parcial]:** desde julio de 2025 Meta cobra por mensaje de plantilla entregado. Las plantillas de *utility* enviadas dentro de una ventana de servicio abierta son gratis ([developers.facebook.com/docs/whatsapp/pricing](https://developers.facebook.com/docs/whatsapp/pricing)). **No pude leer la tarifa oficial para Perú** (está en un CSV o PDF enlazado). Las fuentes secundarias dan cifras distintas para la utility en Perú, entre USD 0,02 y 0,0345 por mensaje ([flowcall.co](https://www.flowcall.co/blog/whatsapp-business-api-pricing), [sleekflow](https://sleekflow.io/en-us/blog/whatsapp-business-price)). **Sin verificar.**
- **Ventajas:** costo cero y es lo que el paciente ya usa. **Desventajas:** no es 24/7, genera dobles reservas y no deja historial estructurado.

### 4.2 Calendly y Google Calendar

- **Calendly [V]** ([calendly.com/pricing](https://calendly.com/pricing)): Gratis (1 tipo de evento); Standard USD 10/mes (USD 8,30 con pago anual); Teams USD 16/usuario/mes. Cobros con Stripe o PayPal desde Standard y política de cancelación configurable. Es un precio global en USD, no hay precio peruano. No tiene ficha de paciente, ni vista de clínica con varios médicos o sedes orientada a salud, ni está en español peruano de serie [I].
- **Google Calendar [V]** ([comparativa de funciones premium](https://support.google.com/calendar/answer/16287038?hl=en)): con una cuenta personal se puede crear 1 página de reservas gratis. Varias páginas, recordatorios por correo, cobro por Stripe y verificación del correo del paciente requieren Workspace o Google One.
- [I] Estos sustitutos los usan médicos independientes con algo de habilidad técnica. Para una clínica con varios médicos y sedes no sirven.

### 4.3 EMR/HIS locales con agenda

- Alaz, OdontoSoft, Nimbo y Dentalink (fichas en la sección 3). En hospitales y clínicas grandes existen HIS de mayor porte, que **no investigué**: están fuera del segmento de WizyDoc, de hasta ~8 médicos.
- [I] El patrón en Perú es que la agenda viene "de regalo" dentro de un EMR que se vende por demo y sin precio público. WizyDoc puede diferenciarse con un precio publicado en soles y un alta self-service.

---

## 5. Huecos y oportunidades para WizyDoc

Contexto: la tesis es que **el paciente reserve directamente con el doctor, sin que nadie de la clínica intervenga por WhatsApp**.

### 5.1 Hueco crítico: el ciclo de la cita no es self-service (verificado en el código)

- **Hoy:** el booking público crea la cita en `PENDING` (`api/prisma/schema.prisma`, `status AppointmentStatus @default(PENDING)`). El correo de confirmación dice: *"Si necesitas cancelar o reprogramar, comunícate con la clínica al {{clinicPhone}}"*. En `api/src/routes/` **no hay ningún endpoint que cambie el estado de una cita**: `CONFIRMED`, `CANCELLED` y `NO_SHOW` solo aparecen en lecturas.
- **Consecuencia [I]:** la reserva es directa, pero la cancelación y la reprogramación vuelven a pasar por el teléfono o WhatsApp de la clínica, justo lo que la tesis quiere eliminar. Además, el hueco liberado no vuelve a ofrecerse a otros pacientes, y la métrica de inasistencias no se alimenta.
- **Competencia:** Doctocliq [V] y Doctoralia [V] ya lo resuelven; AgendaPro, Reservo y Alaz dicen hacerlo [V, según su web].
- **Opciones para el humano:**
  - **A. Link mágico en el correo** para cancelar y reprogramar sin cuenta, con un token de un solo uso y una ventana mínima configurable por la clínica. *Pro:* cierra la tesis sin depender de WhatsApp y encaja con el principio "booking en menos de un minuto". *Contra:* es una ruta pública nueva sobre datos de pacientes, así que exige revisión de seguridad.
  - **B. Solo cancelar** (sin reprogramar) en una primera iteración. *Pro:* menos superficie. *Contra:* el paciente que quiere cambiar de hora igual escribe a la clínica.
  - **C. No hacer nada y que la clínica gestione.** *Contra:* contradice la tesis y deja a WizyDoc por debajo de Doctocliq, incluso del plan gratis de Doctocliq.
  - **Recomendación: A.** Habría que pasarlo al planner como feature prioritaria.

### 5.2 Recordatorios: hoy fuera de alcance, pero estándar en Perú

- Todos los competidores directos los ofrecen, casi siempre **por WhatsApp y con cupos o add-on pago** (Doctocliq de 50 a 150 al mes, AgendaPro desde S/ 17 por 50 mensajes, Doctoralia con SMS). Las inasistencias son parte del problema declarado en `docs/PRODUCT.md`.
- **Opciones para el humano** (cambiar el alcance es su decisión):
  - **A. Recordatorio por correo 24 h antes, con link de cancelar y reprogramar.** *Pro:* el costo marginal es casi nulo (ya existe SES), no cambia la decisión de "sin WhatsApp" y potencia la opción 5.1-A. *Contra:* el correo se lee menos que WhatsApp en Perú [I].
  - **B. WhatsApp vía la API oficial como add-on o con cupo por plan**, como hace la competencia. *Pro:* paridad con el mercado y canal dominante. *Contra:* costo por mensaje (tarifa para Perú sin verificar), alta en Meta, plantillas, y más datos personales hacia un tercero.
  - **C. Mantenerlo fuera de alcance.**
  - **Recomendación: A ahora y evaluar B con datos de inasistencia reales de la beta.**

### 5.3 Precio: dónde gana y dónde pierde WizyDoc

| Segmento | WizyDoc | Competidor más fuerte en precio | Lectura |
|---|---|---|---|
| Médico solo | Gratis, **sin tope de citas** [V] | Doctocliq gratis (30 al mes, con historia clínica); AgendaPro S/ 59 | **Gana** en volumen; **pierde** en historia clínica gratis |
| 2 a 3 médicos | S/ 79/mes | Doctocliq Básico ~S/ 100 (USD 29); AgendaPro Básico S/ 99 | **Gana** en precio y en cobro en soles |
| 4 a 8 médicos, 2 a 3 sedes | S/ 199/mes | **AgendaPro Básico S/ 99 con hasta 20 profesionales**; Premium S/ 149 | **Pierde** en precio por profesional. Su defensa sería la especialización en salud y que no cobra WhatsApp aparte (porque no lo tiene) [I] |
| Especialista que busca pacientes | No compite | Doctoralia desde S/ 199,17/mes anual | Otro trabajo por hacer (captación) |

- Ventajas verificables a comunicar: precios **en soles**, **mensual sin permanencia** (frente al pago anual con permanencia de Doctoralia) y alta sin tarjeta.
- **Pendiente en el repo:** la landing anuncia add-ons (médico adicional a S/ 25 o S/ 20, sede adicional a S/ 40), pero `plan.ts` no tiene precios de add-ons y la integración con Culqi solo usa un `plan_id` por plan. **No encontré en el código cómo se cobran los add-ons** (sí existen los campos `extraDoctors` y `extraClinics`). Conviene confirmarlo antes de comunicarlo.
- Decisión para el humano sobre el plan Clínica frente a AgendaPro: (a) mantener S/ 199 y diferenciarse en salud y simplicidad; (b) subir los médicos incluidos; (c) bajar el precio. No recomiendo bajar el precio sin datos de conversión de la beta.

### 5.4 Otras oportunidades [I]

- **Booking sin cuenta y sin marketplace** como argumento: "tus pacientes reservan contigo, no junto a la competencia". Es lo opuesto al modelo de Doctoralia y AgendarDoctor. Hay que validarlo con entrevistas a médicos.
- **Medicina general, no dental:** Doctocliq, Dentalink y OdontoSoft están volcados a dental. El segmento de medicina general y especialidades de 1 a 8 médicos parece menos cubierto por actores locales con precio público. *Suposición, no medida.*
- **Privacidad (Ley 29733):** solo Alaz la menciona explícitamente. WizyDoc podría comunicar el aislamiento entre cuentas y la minimización de datos, siempre que esté respaldado por hechos.
- **Brechas que no recomiendo atacar ahora** (coherente con el fuera de alcance de `docs/PRODUCT.md`): historia clínica completa, pagos del paciente, teleconsulta y facturación SUNAT. Son el terreno de los EMR y de Doctocliq y alejan a WizyDoc del principio "simple antes que completo".

---

## 6. Qué no pude verificar

- Precios de Nimbo, Dentalink, Alaz, AgendarDoctor, Medilink y Reservo para Perú, y los precios para clínicas de Doctoralia: **no son públicos**.
- Si los precios publicados incluyen IGV.
- La tarifa oficial de Meta por mensaje de WhatsApp en Perú (las fuentes secundarias no coinciden).
- Que el flujo de cancelar y reprogramar de Doctoralia funcione igual en Perú (lo documentan las páginas de ES y MX); el flujo de paciente de AgendaPro, Nimbo, Dentalink y Turnito.
- Si Calendly envía recordatorios por SMS o WhatsApp y en qué plan.
- Reseñas independientes de usuarios **peruanos** para cualquiera de los competidores. Las que cito son de otros países o del propio proveedor.
- Cuota de mercado o número de clientes en Perú de cada competidor. Las cifras citadas las declara cada empresa.
- La operación real en Perú de Medilink, Reservo, MediCloud, Medesk y Clinic Cloud.
- La duración de la prueba gratis de AgendaPro en Perú.
- Cómo se cobran en Culqi los add-ons de WizyDoc.

---

## 7. Fuentes

Todas consultadas el 2026-10-03.

**Repositorio WizyDoc**
- `docs/PRODUCT.md`
- `api/src/domain/entities/subscription/plan.ts`, `api/src/domain/entities/subscription/entitlements.ts`
- `web/src/components/marketing/pricing.tsx`
- `api/prisma/schema.prisma` (enums `AppointmentStatus`, `Plan`)
- `api/src/routes/**` (inventario de endpoints)
- `api/src/infrastructure/services/email-service/templates/confirm-appointment.mjml`
- `api/src/infrastructure/vendors/billing/culqi/culqi-billing.service.ts`

**Competidores (fuentes primarias)**
- Doctoralia: https://pro.doctoralia.pe/precios, https://pro.doctoralia.pe/, https://www.doctoralia.pe/, https://pro.doctoralia.es/productos/funcionalidades/recordatorio-y-confirmacion-de-cita-automatico, https://pro.doctoralia.com.mx/productos/funcionalidades/mensajes-automaticos-de-confirmacion-y-recordatorios
- Doctocliq: https://www.doctocliq.com/planes-y-precios, https://www.doctocliq.com/funcionalidades/agenda-medica-digital, https://www.doctocliq.com/doctocliq-cop, https://www.doctocliq.com/blog/vale-la-pena-doctocliq-pros-contras
- AgendaPro: https://agendapro.com/pe/planes, https://agendapro.com/pe/centro-medico/software-para-centro-medico
- Nimbo: https://www.nimbo-x.com/pe, https://www.nimbo-x.com/precios
- Dentalink: https://contenido.softwaredentalink.com/conoce-dentalink-peru
- Alaz: https://alaz.pe/software-clinicas-peru
- Turnito: https://turnito.app/pe/, https://turnito.app/
- ReservaSimple: https://www.reservasimple.com/app-reservas-ginecologia-peru
- AgendarDoctor: https://www.agendardoctor.com/para-pacientes, https://www.agendardoctor.com/para-doctores
- Medilink: https://www.softwaremedilink.com/planes
- Reservo: https://reservo.cl/homepage/pe/salud/, https://softwarereservo.com/
- Calendly: https://calendly.com/pricing
- Google Calendar: https://support.google.com/calendar/answer/16287038?hl=en
- WhatsApp Business Platform: https://developers.facebook.com/docs/whatsapp/pricing

**Fuentes secundarias**
- Andina: https://andina.pe/agencia/noticia-peruanos-desarrollan-software-contribuye-a-mejorar-gestion-consultorios-medicos-909865.aspx
- Infomercado: https://infomercado.pe/doctocliq-el-software-creado-por-tres-peruanos-ahora-esta-presente-en-12-paises-290922-cch/
- Gestión: https://gestion.pe/economia/empresas/startup-tras-afianzarse-en-el-rubro-dental-startup-doctocliq-va-detras-de-consultorios-esteticos-noticia/
- OdontoSoft (blog de un competidor): https://odontosoft.me/blog/cuanto-cuesta-software-dental-peru/
- Turnito (blog de un competidor): https://turnito.app/blog/los-mejores-software-de-reservas-para-odontologos-en-peru-2026/
- Capterra (AgendaPro): https://www.capterra.com/p/218709/AgendaPro/reviews/
- Medesk (reseña de AgendaPro, competidor): https://www.medesk.net/es/blog/agenda-pro-review/
- OCU (Doctoralia, España): https://www.ocu.org/reclamar/empresas/doctoralia/c171c484f900cca285
- tuquejasuma (Doctoralia): https://tuquejasuma.com/doctoralia
- comparasoftware.pe (Medilink): https://www.comparasoftware.pe/medilink
- Osiptel, Erestel 2025 (vía La República): https://especial.larepublica.pe/peru-conectado/2026/2026/06/02/whatsapp-y-yape-se-consolidan-como-las-plataformas-mas-usadas-por-los-peruanos-segun-encuesta-de-osiptel-87862
- Tipo de cambio BCRP (Infobae): https://www.infobae.com/peru/2026/10/02/dolar-hoy-en-peru-cotizacion-de-apertura-del-2-de-octubre/
- Tarifas de la API de WhatsApp (no coinciden entre sí): https://www.flowcall.co/blog/whatsapp-business-api-pricing, https://sleekflow.io/en-us/blog/whatsapp-business-price
