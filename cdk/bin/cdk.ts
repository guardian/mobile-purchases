import "source-map-support/register";
import { GuRoot } from "@guardian/cdk/lib/constructs/root";
import { FeastGoogleAcquisitionEvents } from '../lib/feast-google-acquisition-events';
import { MobilePurchasesFeast } from "../lib/mobile-purchases-feast";

const app = new GuRoot();
new MobilePurchasesFeast(app, "MobilePurchasesFeast-CODE", { stack: "mobile", stage: "CODE", env: { region: "eu-west-1" } });
new MobilePurchasesFeast(app, "MobilePurchasesFeast-PROD", { stack: "mobile", stage: "PROD", env: { region: "eu-west-1" } });
new FeastGoogleAcquisitionEvents(app, 'feast-google-acquisition-events-CODE', { stack: 'mobile', stage: 'CODE',});
new FeastGoogleAcquisitionEvents(app, 'feast-google-acquisition-events-PROD', {stack: 'mobile', stage: 'PROD',});

