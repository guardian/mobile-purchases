import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { FeastMobilePurchases } from "../lib/feast-mobile-purchases";

const app = new GuRoot();
new FeastMobilePurchases(app, "FeastMobilePurchases-CODE", { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
new FeastMobilePurchases(app, "FeastMobilePurchases-PROD", { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
