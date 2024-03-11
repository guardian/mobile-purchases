import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { MobilePurchases } from "./mobile-purchases";

describe("The MobilePurchases stack", () => {
  it("matches the snapshot", () => {
    const app = new App();
    const stack = new MobilePurchases(app, "MobilePurchases", { stack: "mobile", stage: "TEST" });
    const template = Template.fromStack(stack);
    expect(template.toJSON()).toMatchSnapshot();
  });
});
