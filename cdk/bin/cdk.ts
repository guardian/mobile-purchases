import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { MobilePurchases } from "../lib/mobile-purchases";

const app = new GuRoot();
new MobilePurchases(app, "MobilePurchases-CODE", { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
new MobilePurchases(app, "MobilePurchases-PROD", { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
