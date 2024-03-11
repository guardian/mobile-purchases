import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import {GuLambdaFunction} from "@guardian/cdk/lib/constructs/lambda";
import type { App } from "aws-cdk-lib";
import {Duration} from "aws-cdk-lib";
import {Alias, Key} from 'aws-cdk-lib/aws-kms'
import {Runtime} from "aws-cdk-lib/aws-lambda";
import {Queue, QueueEncryption} from "aws-cdk-lib/aws-sqs";

export class FeastMobilePurchases extends GuStack {
  constructor(scope: App, id: string, props: GuStackProps) {
    super(scope, id, props);

    const app = "mobile-purchases";


    // Lambda functions
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
    const key = new Key(this, 'Key')
    const alias = new Alias(this, 'Alias', { aliasName: 'alias/sqs', targetKey: key })

    const feastAppleSubscriptionsDeadLetterQueue = new Queue(this, "feast-apple-subscriptions-to-fetch-dlq", {
      queueName: `${app}-${this.stage}-feast-apple-subscriptions-to-fetch-dlq`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: alias,
    })

    new Queue(this, "feast-apple-subscriptions-to-fetch", {
      queueName: `${app}-${this.stage}-feast-apple-subscriptions-to-fetch`,
      encryption: QueueEncryption.KMS,
      encryptionMasterKey: alias,
      deadLetterQueue: {
        queue: feastAppleSubscriptionsDeadLetterQueue,
        maxReceiveCount: 8
      }
    })


    // ---- API gateway ---- //
  }
}
