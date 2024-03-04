import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { MobilePurchasesFeast } from "../lib/mobile-purchases-feast";

const app = new GuRoot();
new MobilePurchasesFeast(app, "MobilePurchasesFeast-CODE", { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
new MobilePurchasesFeast(app, "MobilePurchasesFeast-PROD", { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
