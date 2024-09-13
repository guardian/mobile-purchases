import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from "@guardian/cdk/lib/constructs/core";
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda/lambda';
import type { App } from 'aws-cdk-lib';
import { Duration } from 'aws-cdk-lib';
import {
	Effect,
	Policy,
	PolicyStatement,
} from 'aws-cdk-lib/aws-iam';
import { Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Queue } from 'aws-cdk-lib/aws-sqs';

export interface FeastGoogleAcquisitionEventsProps extends GuStackProps {
	stack: string;
	stage: string;
}

export class FeastGoogleAcquisitionEvents extends GuStack {
	constructor(scope: App, id: string, props: FeastGoogleAcquisitionEventsProps) {
		super(scope, id, props);

		const app = 'feast-google-acquisition-events';
		const nameWithStage = `${app}-${this.stage}`;

		const commonEnvironmentVariables = {
			App: app,
			Stack: this.stack,
			Stage: this.stage,
		};

		const nodeVersion = Runtime.NODEJS_20_X;

		//SQS
		const queueName = `${app}-queue-${props.stage}`;
		const deadLetterQueueName = `${app}-dlq-${props.stage}`;

		const deadLetterQueue = new Queue(this, deadLetterQueueName, {
			queueName: deadLetterQueueName,
			retentionPeriod: Duration.days(14),
		});

		const queue = new Queue(this, queueName, {
			queueName,
			deadLetterQueue: {
				// The number of times a message can be unsuccessfully dequeued before being moved to the dlq
				maxReceiveCount: 5,
				queue: deadLetterQueue,
			},
			// This must be >= the lambda timeout
			visibilityTimeout: Duration.minutes(5),
		});

		// SQS to Lambda event source mapping
		const eventSource = new SqsEventSource(queue, {
			reportBatchItemFailures: true,
		});
		const events = [eventSource];

		// ---- API-triggered lambda functions ---- //
		const lambda = new GuLambdaFunction(this, `${app}-lambda`, {
			description:
				'An API Gateway triggered lambda generated in the support-service-lambdas repo',
			functionName: nameWithStage,
			fileName: `${app}.zip`,
			handler: 'index.handler',
			runtime: nodeVersion,
			memorySize: 1024,
			timeout: Duration.seconds(300),
			environment: commonEnvironmentVariables,
			app: app,
			events,
		});

		const s3InlinePolicy: Policy = new Policy(this, 'S3 inline policy', {
			statements: [
				new PolicyStatement({
					effect: Effect.ALLOW,
					actions: ['s3:GetObject'],
					resources: [
						`arn:aws:s3::*:mobile-dist/${this.stack}/${this.stage}/${app}/`,
					],
				}),
			],
		});

		lambda.role?.attachInlinePolicy(s3InlinePolicy);
	}
}