import type { GuStackProps } from "@guardian/cdk/lib/constructs/core";
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import { GuSnsLambdaExperimental } from "@guardian/cdk/lib/experimental/patterns";
import { Duration } from 'aws-cdk-lib';
import type { App } from "aws-cdk-lib";
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { Queue } from "aws-cdk-lib/aws-sqs";

export interface FeastSubscriptionsProps extends GuStackProps {
    stack: string;
    stage: string;
}


export class FeastGoogleAcquisitionsEvent extends GuStack {
    constructor(scope: App, id: string, props: FeastSubscriptionsProps) {
        super(scope, id, props);

        const app = 'mobile-purchases-feast-google-acquisitions-event';
        const nameWithStage = `${app}-${this.stage}`;

        const feastGoogleAcquisitionsEvent = new Queue(this, `${nameWithStage}-sns-queue`, {
            queueName: `${nameWithStage}-queue`,
            retentionPeriod: Duration.days(14),
        });

        new GuSnsLambdaExperimental(this,`${ nameWithStage }`,{
            app: `${ nameWithStage }`,
            functionName: `${ nameWithStage }`,
            existingSnsTopic: { externalTopicName: feastGoogleAcquisitionsEvent.queueName },
            runtime: Runtime.NODEJS_20_X,
            monitoringConfiguration: { noMonitoring: true },
            handler: 'feast-google-acquisitions-event.handler',
            fileName: `feast-google-acquisitions-event.zip`,
        });

        //permissions to read sns queue

        //permissions to access SMS and get google auth

        //permissions to make call to Google

        //permissions to read and write to database


    }

}