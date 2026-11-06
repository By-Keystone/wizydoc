import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";
import { requireEnv } from "../lib/src/shared/env";

const DEPLOYMENT_REGION = "us-east-2";

const requireOrigin = (name: string): string => {
  const value = requireEnv(name);
  const isOrigin =
    URL.canParse(value) && new URL(value).origin === value.replace(/\/$/, "");

  if (!isOrigin) {
    throw new Error(
      `${name} tiene que ser sólo el origen, sin ruta: por ejemplo, https://app.wizydoc.app.`,
    );
  }

  return value;
};

const domain = requireEnv("DOMAIN");

new BackendStack(new App(), "WizydocBackend", {
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
