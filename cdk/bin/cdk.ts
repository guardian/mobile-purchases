import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import {FeastAndroidSubscriptions} from "../lib/feast-android-subscriptions";
import { MobilePurchasesFeast } from "../lib/mobile-purchases-feast";

const app = new GuRoot();
new MobilePurchasesFeast(app, "MobilePurchasesFeast-CODE", { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
new MobilePurchasesFeast(app, "MobilePurchasesFeast-PROD", { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
new FeastAndroidSubscriptions(app, "FeastAndroidSubscriptions-CODE" , { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
new FeastAndroidSubscriptions(app, "FeastAndroidSubscriptions-PROD" , { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
