import type { IEmailService } from "@/application/ports/email-service.port";
import { MemoryEmailService } from "@/infrastructure/services/email-service/memory.service";
import { SESEmailService } from "@/infrastructure/services/email-service/ses.service";

// Allowlist de NODE_ENV === "test" (no rechazo de "production"): así un despliegue real con EMAIL_DRIVER=memory por error no deja de enviar correos sin que nadie lo note.
export function createEmailService(): IEmailService {
  if (process.env.EMAIL_DRIVER === "memory") {
    if (process.env.NODE_ENV !== "test") {
      throw new Error(
        "EMAIL_DRIVER=memory sólo se acepta con NODE_ENV=test (uso exclusivo de los e2e).",
      );
    }

    const captureFile = process.env.EMAIL_CAPTURE_FILE;
    if (!captureFile) {
      throw new Error(
        "EMAIL_DRIVER=memory requiere EMAIL_CAPTURE_FILE (ruta del archivo donde capturar los correos).",
      );
    }

    return new MemoryEmailService({ captureFile });
  }

  return new SESEmailService({
    region: process.env.AWS_REGION!,
    from: process.env.EMAIL_FROM!,
  });
}
