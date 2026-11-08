import type { EmailVO } from "../../domain/value-objects/email.vo";

export interface IAccountExistsNotices {
  tryRegister(email: EmailVO): Promise<boolean>;
}
