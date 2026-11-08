import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Stack } from "aws-cdk-lib";
import * as ses from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";

const TEMPLATES_DIRECTORY = path.join(__dirname, "email-templates");

const readTemplateFile = (fileName: string): string =>
  readFileSync(path.join(TEMPLATES_DIRECTORY, fileName), "utf8");

export interface SignUpEmailTemplate {
  name: string;
  arn: string;
}

export class SignUpEmailTemplates extends Construct {
  readonly confirmEmail: SignUpEmailTemplate;
  readonly pendingConfirmation: SignUpEmailTemplate;
  readonly accountExists: SignUpEmailTemplate;
  readonly signUpCode: SignUpEmailTemplate;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.confirmEmail = this.template(
      "confirm-email",
      "Confirma tu correo en WizyDoc",
    );
    this.pendingConfirmation = this.template(
      "pending-confirmation",
      "Confirma tu cuenta en WizyDoc",
    );
    this.accountExists = this.template(
      "account-exists",
      "Intentaron crear una cuenta con tu correo",
    );
    this.signUpCode = this.template(
      "sign-up-code",
      "Tu código para crear tu cuenta en WizyDoc",
    );
  }

  private template(fileName: string, subject: string): SignUpEmailTemplate {
    const stack = Stack.of(this);
    const name = `${stack.stackName}-${fileName}`;

    new ses.CfnTemplate(this, fileName, {
      template: {
        templateName: name,
        subjectPart: subject,
        htmlPart: readTemplateFile(`${fileName}.html`),
        textPart: readTemplateFile(`${fileName}.txt`),
      },
    });

    return {
      name,
      arn: stack.formatArn({
        service: "ses",
        resource: "template",
        resourceName: name,
      }),
    };
  }
}
