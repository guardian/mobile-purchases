import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import type { App } from "aws-cdk-lib";
import path from "path";
import {CfnInclude} from "aws-cdk-lib/cloudformation-include";

export class MobilePurchases extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    // ---- Existing CFN template ---- //
    const yamlTemplateFilePath = path.join(__dirname, "../..", "cloudformation.yaml");
    new CfnInclude(this, "YamlTemplate", {
      templateFile: yamlTemplateFilePath,
    });
  }
}
