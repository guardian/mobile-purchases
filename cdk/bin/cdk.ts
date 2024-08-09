import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import {FeastGoogleAcquisitionsEvent} from "../lib/feast-google-acquisitions-event";
//import { MobilePurchasesFeast } from "../lib/mobile-purchases-feast";

const app = new GuRoot();
//new MobilePurchasesFeast(app, "MobilePurchasesFeast-CODE", { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
//new MobilePurchasesFeast(app, "MobilePurchasesFeast-PROD", { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
new FeastGoogleAcquisitionsEvent(app, "FeastGoogleAcquisitionsEvent-CODE" , { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
new FeastGoogleAcquisitionsEvent(app, "FeastGoogleAcquisitionsEvent-PROD" , { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
