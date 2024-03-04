import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { MobilePurchasesFeast } from "./mobile-purchases-feast";

describe("The MobilePurchasesFeast stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new MobilePurchasesFeast(app, "MobilePurchasesFeast", { stack: "mobile", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
