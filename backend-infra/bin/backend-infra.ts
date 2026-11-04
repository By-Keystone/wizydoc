import { App } from "aws-cdk-lib";
import { BackendStack } from "../lib/backend-stack";

const DEPLOYMENT_REGION = "us-east-2";

const app = new App();

function requireContext(key: string): string {
  const contextValue: unknown = app.node.tryGetContext(key);

  if (typeof contextValue !== "string" || contextValue === "") {
    throw new Error(
      `Falta el contexto "${key}": pásalo con -c ${key}=... o agrégalo a cdk.json.`,
    );
  }

  return contextValue;
}

new BackendStack(app, "WizydocBackend", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: DEPLOYMENT_REGION,
  },
  hostedZoneId: requireContext("hostedZoneId"),
  zoneName: requireContext("zoneName"),
  apiDomainName: requireContext("apiDomainName"),
});
