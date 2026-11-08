import assert from "node:assert/strict";
import { test } from "node:test";
import { App, Stack } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Authentication, PLATFORM_CLIENT_NAME } from "../lib/authentication";

function synthesizeAuthentication() {
  const stack = new Stack(new App(), "AuthenticationTest", {
    env: { account: "111111111111", region: "us-east-2" },
  });

  new Authentication(stack, "Authentication");

  return Template.fromStack(stack);
}

const clientProperties = (template: Template) =>
  Object.values(template.findResources("AWS::Cognito::UserPoolClient")).map(
    ({ Properties }) => Properties,
  );

test("hay un solo cliente, el de platform, con secreto, sin OAuth y sin revelar si el usuario existe", () => {
  const clients = clientProperties(synthesizeAuthentication());

  assert.equal(clients.length, 1);
  assert.equal(clients[0].ClientName, PLATFORM_CLIENT_NAME);
  for (const client of clients) {
    assert.equal(client.GenerateSecret, true);
    assert.equal(client.PreventUserExistenceErrors, "ENABLED");
    assert.equal(client.AllowedOAuthFlows, undefined);
    assert.equal(client.CallbackURLs, undefined);
  }
});

test("el cliente de platform sólo admite ADMIN_USER_PASSWORD_AUTH y el refresco, y su refresh token dura 30 días", () => {
  const [session] = clientProperties(synthesizeAuthentication()).filter(
    ({ ClientName }) => ClientName === PLATFORM_CLIENT_NAME,
  );

  assert.deepEqual(session.ExplicitAuthFlows, [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]);
  assert.equal(session.RefreshTokenValidity, 30 * 24 * 60);
  assert.equal(session.TokenValidityUnits.RefreshToken, "minutes");
});

test("cada cliente escribe sólo email, given_name y family_name, y revoca tokens", () => {
  for (const client of clientProperties(synthesizeAuthentication())) {
    assert.deepEqual([...client.WriteAttributes].sort(), [
      "email",
      "family_name",
      "given_name",
    ]);
    assert.equal(client.EnableTokenRevocation, true);
  }
});

test("el correo es obligatorio e inmutable, así nadie lo cambia con su access token", () => {
  const template = synthesizeAuthentication();
  const [userPool] = Object.values(
    template.findResources("AWS::Cognito::UserPool"),
  );

  assert.deepEqual(
    userPool.Properties.Schema.filter(
      ({ Name }: { Name: string }) => Name === "email",
    ),
    [{ Name: "email", Required: true, Mutable: false }],
  );
});

test("hay un solo user pool y sus dos clientes apuntan a él", () => {
  const template = synthesizeAuthentication();
  const [poolId] = Object.keys(
    template.findResources("AWS::Cognito::UserPool"),
  );

  assert.equal(
    Object.keys(template.findResources("AWS::Cognito::UserPool")).length,
    1,
  );
  for (const client of clientProperties(template)) {
    assert.deepEqual(client.UserPoolId, { Ref: poolId });
  }
});

test("se inicia sesión con el correo, sin distinguir mayúsculas", () => {
  const template = synthesizeAuthentication();

  template.hasResourceProperties("AWS::Cognito::UserPool", {
    UsernameAttributes: ["email"],
    UsernameConfiguration: { CaseSensitive: false },
  });
});

test("Cognito no registra, no confirma ni recupera: lo hace el api", () => {
  const template = synthesizeAuthentication();

  const [userPool] = Object.values(
    template.findResources("AWS::Cognito::UserPool"),
  );

  assert.deepEqual(userPool.Properties.AdminCreateUserConfig, {
    AllowAdminCreateUserOnly: true,
  });
  assert.deepEqual(userPool.Properties.AutoVerifiedAttributes, []);
  assert.deepEqual(userPool.Properties.AccountRecoverySetting, {
    RecoveryMechanisms: [{ Name: "admin_only", Priority: 1 }],
  });
  assert.equal(userPool.Properties.EmailConfiguration, undefined);
});
