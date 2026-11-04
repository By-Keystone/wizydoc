import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";

const DEPLOYMENT_REGION = "us-east-2";

function requireEnv(name: string): string {
  const envValue = process.env[name];

  if (!envValue) {
    throw new Error(`Falta la variable de entorno ${name}.`);
  }

  return envValue;
}

const domain = requireEnv("DOMAIN");

new BackendStack(new App(), "WizydocBackend", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEPLOYMENT_REGION,
  },
  hostedZoneId: requireEnv("HOSTED_ZONE_ID"),
  zoneName: domain,
  apiDomainName: `${requireEnv("API_SUBDOMAIN")}.${domain}`,
});
