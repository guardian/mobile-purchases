import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import type { App } from "aws-cdk-lib";
import {GuLambdaFunction} from "@guardian/cdk/lib/constructs/lambda";
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {Duration} from "aws-cdk-lib";

export class MobilePurchases extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const app = "mobile-purchases";


    // Lambda Functions
    new GuLambdaFunction(this,"applepubsub-v2", {
      app: app,
      description: "Records new App Store Feast subs",
      functionName: `${app}-applepubsub-v2-${this.stage}`,
      fileName: "", // TODO
      handler: "apple-pubsub-v2.handler",
      runtime: Runtime.NODEJS_20_X,
      memorySize: 128,
      timeout: Duration.seconds(29),
      environment: {
        App: app,
        Stack: this.stack,
        Stage: this.stage,
      },
    })

    new GuLambdaFunction(this,"apple-v2-update-subscriptions-lambda", {
      app: app,
      description: "Updates App Store Feast subs",
      functionName: `${app}-apple-v2-update-subscriptions-${this.stage}`,
      fileName: "", // TODO
      handler: "apple-update-subscriptions-v2.handler",
      runtime: Runtime.NODEJS_20_X,
      memorySize: 512,
      timeout: Duration.seconds(25),
      environment: {
        App: app,
        Stack: this.stack,
        Stage: this.stage,
      },
    })


    // Queues
  }
}
