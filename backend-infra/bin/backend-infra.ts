import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";
import { requireEnv } from "../lib/src/shared/env";

const DEPLOYMENT_REGION = "us-east-2";

const domain = requireEnv("DOMAIN");

new BackendStack(new App(), "WizydocBackend", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEPLOYMENT_REGION,
  },
  hostedZoneId: requireEnv("HOSTED_ZONE_ID"),
  zoneName: domain,
  apiDomainName: `${requireEnv("API_SUBDOMAIN")}.${domain}`,
  frontendUrl: requireEnv("FRONTEND_URL"),
  emailFrom: requireEnv("EMAIL_FROM"),
  termsAcceptanceRequired: process.env.TERMS_ACCEPTANCE_REQUIRED === "true",
});
