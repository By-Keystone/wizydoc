import type { Metadata } from "next";

/**
 * PENDIENTE ANTES DE PUBLICAR:
 * 1. Reemplazar los valores de `titular` con los datos reales del comercio.
 * 2. Revisión de un abogado peruano, sobre todo las secciones 9 (datos
 *    personales: se tratan datos de salud, que son sensibles bajo la Ley 29733)
 *    y 11 (limitación de responsabilidad).
 */
const titular = {
  razonSocial: "[RAZÓN SOCIAL]",
  ruc: "[RUC]",
  domicilioFiscal: "[DOMICILIO FISCAL]",
  correo: "[CORREO ELECTRÓNICO]",
  telefono: "[TELÉFONO]",
};

const ultimaActualizacion = "26 de septiembre de 2026";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description:
    "Términos y condiciones de uso del servicio de gestión de citas médicas WizyDoc.",
  alternates: {
    canonical: "/terminos-y-condiciones",
  },
};

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold tracking-tight text-brand-teal-dark">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-brand-gray">
        {children}
      </div>
    </section>
  );
}

export default function TerminosYCondicionesPage() {
  return (
    <div className="bg-white py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-brand-teal-dark sm:text-4xl">
          Términos y condiciones
        </h1>
        <p className="mt-3 text-sm text-brand-gray">
          Última actualización: {ultimaActualizacion}
        </p>

        <Section title="1. Identificación del titular">
          <p>
            El presente sitio web y el servicio WizyDoc son operados por{" "}
            <strong className="text-brand-ink">{titular.razonSocial}</strong>,
            con RUC N.° {titular.ruc}, con domicilio fiscal en{" "}
            {titular.domicilioFiscal} (en adelante, &ldquo;WizyDoc&rdquo;).
          </p>
          <p>
            Correo electrónico de contacto: {titular.correo}. Teléfono de
            contacto: {titular.telefono}.
          </p>
        </Section>

        <Section title="2. Objeto del servicio">
          <p>
            WizyDoc es una plataforma de software que permite a médicos,
            consultorios y clínicas gestionar la reserva de citas, administrar
            los horarios de sus profesionales, registrar la información de sus
            pacientes y enviar confirmaciones automáticas de cada cita.
          </p>
          <p>
            WizyDoc es únicamente un proveedor de software.{" "}
            <strong className="text-brand-ink">
              No presta servicios médicos ni de salud
            </strong>
            , no interviene en la relación entre el profesional de salud y su
            paciente, y no es responsable por la atención médica brindada, por
            la disponibilidad real del profesional ni por el cumplimiento de las
            citas agendadas a través de la plataforma.
          </p>
        </Section>

        <Section title="3. Definiciones">
          <p>
            <strong className="text-brand-ink">Usuario o Cliente:</strong>{" "}
            persona natural o jurídica que contrata un plan de WizyDoc y
            administra una o más sedes dentro de la plataforma.
          </p>
          <p>
            <strong className="text-brand-ink">Cuenta:</strong> espacio de
            trabajo creado por el Usuario, que agrupa sus sedes, médicos y
            configuración.
          </p>
          <p>
            <strong className="text-brand-ink">Sede:</strong> cada local o punto
            de atención registrado por el Usuario dentro de su Cuenta.
          </p>
          <p>
            <strong className="text-brand-ink">Paciente:</strong> persona que
            reserva una cita a través del enlace público de reservas de una
            Sede.
          </p>
          <p>
            <strong className="text-brand-ink">Suscripción:</strong> plan
            contratado por el Usuario, con la periodicidad y el precio vigentes
            al momento de la contratación.
          </p>
        </Section>

        <Section title="4. Registro y cuenta">
          <p>
            Para usar WizyDoc el Usuario debe registrarse proporcionando
            información veraz, completa y actualizada, y confirmar su correo
            electrónico. El Usuario es responsable de la exactitud de los datos
            que registre.
          </p>
          <p>
            Las credenciales de acceso son personales e intransferibles. El
            Usuario es responsable de mantenerlas en reserva y de toda actividad
            realizada desde su Cuenta. Debe notificar a WizyDoc de inmediato
            ante cualquier uso no autorizado.
          </p>
        </Section>

        <Section title="5. Planes, precios y facturación">
          <p>
            WizyDoc ofrece un plan gratuito y planes de pago. Los precios
            vigentes son: Consultorio, S/ 79 al mes; Clínica, S/ 199 al mes; y
            Red, con precio a medida según el alcance acordado. Los precios
            están expresados en soles peruanos (PEN).
          </p>
          <p>
            Además del precio base, aplican los siguientes cargos variables:
            médico adicional en el plan Consultorio, S/ 25 al mes; médico
            adicional en el plan Clínica, S/ 20 al mes; y sede adicional, S/ 40
            al mes en ambos planes.
          </p>
          <p>
            La suscripción a un plan de pago genera un{" "}
            <strong className="text-brand-ink">
              cobro recurrente mensual automático
            </strong>{" "}
            sobre la tarjeta registrada por el Usuario, que se renueva
            automáticamente por periodos iguales mientras el Usuario no cancele.
            El procesamiento de pagos se realiza a través de Culqi; WizyDoc no
            almacena los datos completos de la tarjeta.
          </p>
          <p>
            Si un cobro es rechazado, WizyDoc podrá reintentarlo y, de persistir
            el rechazo, suspender el acceso a las funciones del plan de pago
            hasta regularizar el pago.
          </p>
        </Section>

        <Section title="6. Cancelación y vigencia">
          <p>
            La contratación no tiene periodo de permanencia mínima. El Usuario
            puede cancelar su suscripción en cualquier momento desde la
            plataforma o escribiendo a {titular.correo}.
          </p>
          <p>
            La cancelación surte efecto al finalizar el periodo mensual ya
            pagado: el Usuario conserva el acceso a su plan hasta esa fecha y no
            se le realizarán cobros posteriores. Al vencer, la Cuenta pasa al
            plan gratuito con sus límites correspondientes.
          </p>
        </Section>

        <Section title="7. Política de cambios y devoluciones">
          <p>
            Las condiciones de cambio de plan y de devolución se detallan en
            nuestra Política de cambios y devoluciones, que forma parte
            integrante de estos términos.
          </p>
        </Section>

        <Section title="8. Obligaciones del usuario">
          <p>
            El Usuario se obliga a usar WizyDoc conforme a la ley y a no
            emplearlo para fines ilícitos, fraudulentos o que vulneren derechos
            de terceros.
          </p>
          <p>
            El Usuario declara que cuenta con el{" "}
            <strong className="text-brand-ink">
              consentimiento válido de sus pacientes
            </strong>{" "}
            para registrar y tratar sus datos personales en la plataforma, y que
            cumple con la normativa aplicable en materia de protección de datos
            y de historias clínicas.
          </p>
        </Section>

        <Section title="9. Tratamiento de datos personales">
          <p>
            El tratamiento de datos personales se rige por la Ley N.° 29733, Ley
            de Protección de Datos Personales, y su reglamento. Los datos
            vinculados a la salud de los pacientes constituyen{" "}
            <strong className="text-brand-ink">datos sensibles</strong> y reciben
            protección reforzada.
          </p>
          <p>
            Respecto de los datos de los pacientes, el Usuario actúa como
            titular del banco de datos y WizyDoc actúa como{" "}
            <strong className="text-brand-ink">encargado del tratamiento</strong>
            , limitándose a tratarlos conforme a las instrucciones del Usuario y
            a lo necesario para prestar el servicio.
          </p>
          <p>
            Los titulares de datos pueden ejercer sus derechos de acceso,
            rectificación, cancelación y oposición escribiendo a{" "}
            {titular.correo}. El detalle del tratamiento se describe en nuestra
            Política de privacidad.
          </p>
        </Section>

        <Section title="10. Propiedad intelectual">
          <p>
            El software, la marca, el logotipo, el diseño y todo el contenido de
            la plataforma son de titularidad de WizyDoc y están protegidos por
            la normativa de propiedad intelectual. La contratación de un plan
            otorga al Usuario una licencia de uso limitada, no exclusiva e
            intransferible, vigente mientras dure la suscripción.
          </p>
          <p>
            La información y los datos que el Usuario carga en la plataforma
            siguen siendo de su titularidad.
          </p>
        </Section>

        <Section title="11. Disponibilidad del servicio y limitación de responsabilidad">
          <p>
            WizyDoc procura mantener el servicio disponible de forma continua,
            pero no garantiza una disponibilidad ininterrumpida. El servicio
            puede suspenderse temporalmente por mantenimiento, actualizaciones o
            causas ajenas a WizyDoc, procurando avisar con anticipación cuando
            sea posible.
          </p>
          <p>
            WizyDoc no es responsable por daños derivados del uso indebido de la
            plataforma por parte del Usuario, de la información que este cargue,
            de la pérdida de credenciales, ni de la relación entre el
            profesional de salud y sus pacientes.
          </p>
        </Section>

        <Section title="12. Modificaciones de los términos">
          <p>
            WizyDoc puede modificar estos términos para reflejar cambios en el
            servicio o en la normativa aplicable. Los cambios relevantes serán
            comunicados al correo registrado por el Usuario con una anticipación
            razonable. El uso continuado del servicio después de la entrada en
            vigencia implica su aceptación.
          </p>
        </Section>

        <Section title="13. Ley aplicable y jurisdicción">
          <p>
            Estos términos se rigen por las leyes de la República del Perú. Para
            cualquier controversia, las partes se someten a la jurisdicción de
            los jueces y tribunales del Cercado de Lima, sin perjuicio del
            derecho del consumidor de acudir a INDECOPI.
          </p>
        </Section>

        <Section title="14. Contacto y Libro de Reclamaciones">
          <p>
            Para consultas sobre estos términos puedes escribirnos a{" "}
            {titular.correo} o llamarnos al {titular.telefono}.
          </p>
          <p>
            Conforme al Código de Protección y Defensa del Consumidor, ponemos a
            disposición nuestro Libro de Reclamaciones virtual.
          </p>
        </Section>
      </div>
    </div>
  );
}
