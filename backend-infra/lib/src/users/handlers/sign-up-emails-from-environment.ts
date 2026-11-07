import { SESv2Client } from "@aws-sdk/client-sesv2";
import { requireEnv } from "../../shared/env";
import { SesSignUpEmails } from "../infrastructure/email/ses/sign-up-emails";

export const signUpEmailsFromEnvironment = (): SesSignUpEmails =>
  new SesSignUpEmails(new SESv2Client({}), {
    fromAddress: requireEnv("EMAIL_FROM"),
    frontendUrl: requireEnv("FRONTEND_URL"),
    templates: {
      confirmEmail: requireEnv("CONFIRM_EMAIL_TEMPLATE"),
      pendingConfirmation: requireEnv("PENDING_CONFIRMATION_TEMPLATE"),
      accountExists: requireEnv("ACCOUNT_EXISTS_TEMPLATE"),
    },
  });
