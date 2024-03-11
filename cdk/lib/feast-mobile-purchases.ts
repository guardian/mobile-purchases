import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import {GuLambdaFunction} from "@guardian/cdk/lib/constructs/lambda";
import type { App } from "aws-cdk-lib";
import {Duration} from "aws-cdk-lib";
import {Runtime} from "aws-cdk-lib/aws-lambda";

export class FeastMobilePurchases extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const app = "mobile-purchases";


    // Lambda Functions
    new GuLambdaFunction(this,"feast-apple-pubsub-lambda", {
      app: app,
      description: "Records new App Store Feast subs",
      functionName: `${app}-feast-apple-pubsub-${this.stage}`,
      fileName: "feast-apple-pubsub.zip",
      handler: "feast-apple-pubsub.handler",
      runtime: Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: Duration.seconds(30),
      environment: {
        App: app,
        Stack: this.stack,
        Stage: this.stage,
      },
    })

    new GuLambdaFunction(this,"feast-apple-update-subscriptions-lambda", {
      app: app,
      description: "Updates App Store Feast subs",
      functionName: `${app}-feast-apple-update-subscriptions-${this.stage}`,
      fileName: "feast-apple-update-subscriptions.zip",
      handler: "feast-apple-update-subscriptions.handler",
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(30),
      environment: {
        App: app,
        Stack: this.stack,
        Stage: this.stage,
      },
    })


    // Queues
  }
}
