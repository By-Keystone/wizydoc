import fs from "node:fs/promises";
import path from "node:path";
import Handlebars from "handlebars";
import mjml2html from "mjml";

export type EmailTemplate =
  | "confirm-email"
  | "invite-user"
  | "reset-password"
  | "pending-invitation"
  | "confirm-appointment"
  | "patient-cancelled-appointment"
  | "doctor-cancelled-appointment"
  | "patient-rescheduled-appointment"
  | "doctor-rescheduled-appointment";

interface TemplateVariables {
  "confirm-email": { name: string; confirmUrl: string };
  "invite-user": { name: string; resourceName: string; inviteUrl: string };
  "reset-password": { name: string; resetUrl: string };
  "pending-invitation": {
    name: string;
    resourceName: string;
    inviteUrl: string | null;
  };
  /** Acuse de reserva: la cita ya está creada, no hay nada que confirmar. */
  "confirm-appointment": {
    patientName: string;
    patientLastName: string;
    scheduledAt: string;
    durationMinutes: number;
    specialty: string;
    doctorName: string;
    clinicName: string;
    clinicAddress: string;
    manageUrl: string | null;
  };
  "patient-cancelled-appointment": { patientName: string; manageUrl: string };
  "doctor-cancelled-appointment": {
    doctorName: string;
    scheduledAt: string;
    specialty: string;
    reason: string;
    agendaUrl: string;
  };
  "patient-rescheduled-appointment": {
    patientName: string;
    patientLastName: string;
    scheduledAt: string;
    durationMinutes: number;
    specialty: string;
    doctorName: string;
    clinicName: string;
    clinicAddress: string;
    manageUrl: string;
  };
  "doctor-rescheduled-appointment": {
    doctorName: string;
    previousScheduledAt: string;
    scheduledAt: string;
    durationMinutes: number;
    specialty: string;
    newDoctorFullName: string;
    clinicName: string;
    previousDoctorName: string | null;
    agendaUrl: string;
  };
}

const compiledCache = new Map<EmailTemplate, HandlebarsTemplateDelegate>();

async function loadTemplate(
  name: EmailTemplate,
): Promise<HandlebarsTemplateDelegate> {
  const cached = compiledCache.get(name);
  if (cached) return cached;

  const filePath = path.join(__dirname, "templates", `${name}.mjml`);
  const source = await fs.readFile(filePath, "utf-8");
  const compiled = Handlebars.compile(source);
  compiledCache.set(name, compiled);
  return compiled;
}

export async function renderTemplate<T extends EmailTemplate>(
  name: T,
  variables: TemplateVariables[T],
): Promise<string> {
  const template = await loadTemplate(name);
  const mjmlSource = template(variables);
  const { html, errors } = await mjml2html(mjmlSource, {
    validationLevel: "strict",
  });

  if (errors.length > 0) {
    throw new Error(
      `MJML compilation errors in ${name}: ${errors.map((e) => e.message).join(", ")}`,
    );
  }

  return html;
}
