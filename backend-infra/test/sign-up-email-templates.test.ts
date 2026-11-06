import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { test } from "node:test";
import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { BackendStack } from "../lib/backend-stack";
import { createConfirmationToken } from "../lib/src/users/domain/confirmation-token.entity";
import { buildUser } from "./users/fakes";
import {
  capturingSes,
  emailsFor,
  templateDataOf,
} from "./users/sign-up-emails.test";

const TEMPLATES_DIRECTORY = path.join(__dirname, "../lib/email-templates");

const placeholdersOf = (fileName: string): Set<string> =>
  new Set(
    [
      ...readFileSync(
        path.join(TEMPLATES_DIRECTORY, fileName),
        "utf8",
      ).matchAll(/{{\s*(\w+)\s*}}/g),
    ].map(([, placeholder]) => placeholder),
  );

const sentTemplateData = async () => {
  const { sesClient, inputs } = capturingSes();
  const emails = emailsFor(sesClient);
  const user = buildUser({ confirmed: false });
  const confirmationToken = createConfirmationToken(user.id);

  await emails.sendConfirmation(user, confirmationToken);
  await emails.sendPendingConfirmation(user, confirmationToken);
  await emails.sendAccountExists(user);

  const [confirmEmail, pendingConfirmation, accountExists] = inputs.map(
    (input) => new Set(Object.keys(templateDataOf(input))),
  );
  return {
    "confirm-email": confirmEmail,
    "pending-confirmation": pendingConfirmation,
    "account-exists": accountExists,
  };
};

const synthesizeBackend = () =>
  Template.fromStack(
    new BackendStack(
      new App({ context: { "aws:cdk:bundling-stacks": [] } }),
      "BackendTest",
      {
        env: { account: "111111111111", region: "us-east-2" },
        hostedZoneId: "Z0000000000000000000",
        zoneName: "wizydoc.app",
        apiDomainName: "api.wizydoc.app",
        frontendUrl: "https://app.wizydoc.app",
        emailFrom: "WizyDoc <no-reply@wizydoc.app>",
        termsAcceptanceRequired: false,
      },
    ),
  );

test("cada marcador de las plantillas recibe un dato del adaptador, y el HTML sólo usa el nombre escapado", async () => {
  const dataByTemplate = await sentTemplateData();

  for (const [templateName, sentKeys] of Object.entries(dataByTemplate)) {
    const htmlPlaceholders = placeholdersOf(`${templateName}.html`);
    const textPlaceholders = placeholdersOf(`${templateName}.txt`);

    for (const placeholder of [...htmlPlaceholders, ...textPlaceholders]) {
      assert.ok(
        sentKeys.has(placeholder),
        `${templateName}: {{${placeholder}}}`,
      );
    }
    assert.ok(htmlPlaceholders.has("escapedName"), templateName);
    assert.equal(htmlPlaceholders.has("name"), false, templateName);
    assert.equal(textPlaceholders.has("escapedName"), false, templateName);
  }
});

test("el stack crea las tres plantillas con el nombre del stack y el asunto de cada correo", () => {
  const template = synthesizeBackend();

  for (const [templateName, subject] of [
    ["BackendTest-confirm-email", "Confirma tu correo en WizyDoc"],
    ["BackendTest-pending-confirmation", "Confirma tu cuenta en WizyDoc"],
    ["BackendTest-account-exists", "Intentaron crear una cuenta con tu correo"],
  ]) {
    template.hasResourceProperties("AWS::SES::Template", {
      Template: { TemplateName: templateName, SubjectPart: subject },
    });
  }
});

test("cada Lambda recibe los nombres de las plantillas y sólo puede enviar con las suyas", () => {
  const template = synthesizeBackend();
  const functions = template.findResources("AWS::Lambda::Function");
  const policies = Object.values(template.findResources("AWS::IAM::Policy"));
  const policyOf = (functionName: string) => {
    const [logicalId] = Object.keys(functions).filter((id) =>
      id.startsWith(functionName),
    );
    const role = functions[logicalId].Properties.Role["Fn::GetAtt"][0];
    return {
      environment: functions[logicalId].Properties.Environment.Variables,
      policy: JSON.stringify(
        policies.find((candidate) =>
          JSON.stringify(candidate.Properties.Roles).includes(role),
        )?.Properties.PolicyDocument,
      ),
    };
  };

  const signUp = policyOf("SignUpFunction");
  const resend = policyOf("ResendConfirmationFunction");

  assert.equal(
    signUp.environment.CONFIRM_EMAIL_TEMPLATE,
    "BackendTest-confirm-email",
  );
  assert.equal(
    signUp.environment.PENDING_CONFIRMATION_TEMPLATE,
    "BackendTest-pending-confirmation",
  );
  assert.equal(
    signUp.environment.ACCOUNT_EXISTS_TEMPLATE,
    "BackendTest-account-exists",
  );
  for (const templateName of [
    "confirm-email",
    "pending-confirmation",
    "account-exists",
  ]) {
    assert.ok(
      signUp.policy.includes(`:template/BackendTest-${templateName}`),
      templateName,
    );
  }
  assert.ok(resend.policy.includes(":template/BackendTest-confirm-email"));
  assert.equal(resend.policy.includes("BackendTest-account-exists"), false);
  assert.equal(
    resend.policy.includes("BackendTest-pending-confirmation"),
    false,
  );
});
