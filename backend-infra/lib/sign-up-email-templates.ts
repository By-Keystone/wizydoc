import { readFileSync } from "node:fs";
import * as path from "node:path";
import { Stack } from "aws-cdk-lib";
import * as ses from "aws-cdk-lib/aws-ses";
import { Construct } from "constructs";

const TEMPLATES_DIRECTORY = path.join(__dirname, "email-templates");

const readTemplateFile = (fileName: string): string =>
  readFileSync(path.join(TEMPLATES_DIRECTORY, fileName), "utf8");

export class SignUpEmailTemplates extends Construct {
  readonly confirmEmail: string;
  readonly pendingConfirmation: string;
  readonly accountExists: string;

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
  }

  arnOf(templateName: string): string {
    return Stack.of(this).formatArn({
      service: "ses",
      resource: "template",
      resourceName: templateName,
    });
  }

  private template(fileName: string, subject: string): string {
    const templateName = `${Stack.of(this).stackName}-${fileName}`;

    new ses.CfnTemplate(this, fileName, {
      template: {
        templateName,
        subjectPart: subject,
        htmlPart: readTemplateFile(`${fileName}.html`),
        textPart: readTemplateFile(`${fileName}.txt`),
      },
    });

    return templateName;
  }
}
