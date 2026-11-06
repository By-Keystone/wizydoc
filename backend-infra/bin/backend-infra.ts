import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";
import { isPlatformOrigin } from "../lib/platform-origin";
import { requireEnv } from "../lib/src/shared/env";

const DEPLOYMENT_REGION = "us-east-2";

const requireOrigin = (name: string): string => {
  const value = requireEnv(name);

  if (!isPlatformOrigin(value)) {
    throw new Error(
      `${name} tiene que ser sólo el origen, sin ruta, con https (salvo localhost) y con un host de letras, números, puntos y guiones: por ejemplo, https://app.wizydoc.app.`,
    );
  }

  return value;
};

const domain = requireEnv("DOMAIN");

new BackendStack(new App(), process.env.STACK_NAME || "WizydocBackend", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEPLOYMENT_REGION,
  },
  hostedZoneId: requireEnv("HOSTED_ZONE_ID"),
  zoneName: domain,
  apiDomainName: `${requireEnv("API_SUBDOMAIN")}.${domain}`,
  frontendUrl: requireOrigin("FRONTEND_URL"),
  emailFrom: requireEnv("EMAIL_FROM"),
  termsAcceptanceRequired: process.env.TERMS_ACCEPTANCE_REQUIRED === "true",
});
