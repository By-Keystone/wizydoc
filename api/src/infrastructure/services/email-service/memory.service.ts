import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  IEmailService,
  SendEmailParams,
} from "@/application/ports/email-service.port";

interface MemoryEmailServiceConfig {
  captureFile: string;
}

interface CapturedEmail extends SendEmailParams {
  sentAt: string;
}

// Escribe a archivo, no a un array en memoria, porque Playwright corre en otro proceso que el api y necesita leer lo capturado desde disco.
export class MemoryEmailService implements IEmailService {
  private readonly captureFile: string;

  constructor(config: MemoryEmailServiceConfig) {
    this.captureFile = config.captureFile;
  }

  async send(params: SendEmailParams): Promise<void> {
    const capturedEmail: CapturedEmail = {
      ...params,
      sentAt: new Date().toISOString(),
    };

    await mkdir(dirname(this.captureFile), { recursive: true });
    await appendFile(this.captureFile, `${JSON.stringify(capturedEmail)}\n`);
  }
}
