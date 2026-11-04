import assert from "node:assert/strict";
import { test } from "node:test";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Authentication } from "../lib/authentication";

function synthesizeAuthentication() {
  const stack = new Stack(new App(), "AuthenticationTest", {
    env: { account: "111111111111", region: "us-east-2" },
  });

  new Authentication(stack, "Authentication", { domain: "wizydoc.app" });

  return Template.fromStack(stack);
}

test("sólo el api puede usar el cliente y no hay flujos OAuth", () => {
  const template = synthesizeAuthentication();

  const [client] = Object.values(
    template.findResources("AWS::Cognito::UserPoolClient"),
  );

  assert.equal(client.Properties.GenerateSecret, true);
  assert.equal(client.Properties.PreventUserExistenceErrors, "ENABLED");
  assert.equal(client.Properties.AllowedOAuthFlows, undefined);
  assert.equal(client.Properties.CallbackURLs, undefined);
  assert.deepEqual(client.Properties.ExplicitAuthFlows, [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]);
});

test("se inicia sesión con el correo, sin distinguir mayúsculas", () => {
  const template = synthesizeAuthentication();

  template.hasResourceProperties("AWS::Cognito::UserPool", {
    UsernameAttributes: ["email"],
    UsernameConfiguration: { CaseSensitive: false },
    EmailConfiguration: {
      EmailSendingAccount: "DEVELOPER",
      From: "WizyDoc <no-reply@wizydoc.app>",
    },
  });
});
