import type { GuStackProps } from '@guardian/cdk/lib/constructs/core';
import { GuStack } from '@guardian/cdk/lib/constructs/core';
import { GuLambdaFunction } from '@guardian/cdk/lib/constructs/lambda';
import type { App } from 'aws-cdk-lib';
import {
	Duration,
	aws_dynamodb as dynamodb,
	aws_sqs as sqs,
	aws_lambda as lambda,
	aws_events as events,
	aws_events_targets as targets,
	aws_iam as iam,
	aws_cloudwatch as cloudwatch,
	aws_lambda_event_sources as eventSources,
	CfnOutput,
} from 'aws-cdk-lib';

interface MobilePurchasesSoftOptInAcquisitionsProps extends GuStackProps {
	membershipAccountId: string;
	userSubscriptionsStreamArn: string;
}

export class MobilePurchasesSoftOptInAcquisitions extends GuStack {
	constructor(
		scope: App,
		id: string,
		props: MobilePurchasesSoftOptInAcquisitionsProps,
	) {
		super(scope, id, props);

		const { stage, stack, app } = this;
		const { membershipAccountId, userSubscriptionsStreamArn } = props;

		// Get the soft opt-in consent setter stage based on the current stage
		const softOptInConsentSetterStage = stage === 'PROD' ? 'PROD' : 'CODE';

		// Dead Letter Queue for acquisitions
		const acquisitionsDeadLetterQueue = new sqs.Queue(
			this,
			'AcquisitionsDeadLetterQueue',
			{
				queueName: `${app!}-soft-opt-in-acquisitions-DLQ-${stage}`,
				retentionPeriod: Duration.days(14),
			},
		);

		// IAM Role for Soft Opt-In Acquisitions Lambda
		const softOptInAcquisitionsRole = new iam.Role(
			this,
			'SoftOptInAcquisitionsRole',
			{
				assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
				managedPolicies: [
					iam.ManagedPolicy.fromAwsManagedPolicyName(
						'service-role/AWSLambdaBasicExecutionRole',
					),
				],
				inlinePolicies: {
					SoftOptInAcquisitionsPolicy: new iam.PolicyDocument({
						statements: [
							// Allow assume role for membership account
							new iam.PolicyStatement({
								effect: iam.Effect.ALLOW,
								actions: ['sts:AssumeRole'],
								resources: [
									`arn:aws:iam::${membershipAccountId}:role/membership-${softOptInConsentSetterStage}-soft-opt-in-consent-setter-QueueCrossAccountRole`,
									`arn:aws:iam::${membershipAccountId}:role/comms-${stage}-EmailQueueCrossAccountRole`,
								],
							}),
							// DynamoDB permissions for subscriptions table
							new iam.PolicyStatement({
								effect: iam.Effect.ALLOW,
								actions: ['dynamodb:Query', 'dynamodb:GetItem'],
								resources: [
									`arn:aws:dynamodb:${this.region}:${this.account}:table/${app!}-${stage}-subscriptions`,
									`arn:aws:dynamodb:${this.region}:${this.account}:table/${app!}-${stage}-subscriptions/*`,
								],
							}),
							// SSM permissions
							new iam.PolicyStatement({
								effect: iam.Effect.ALLOW,
								actions: ['ssm:GetParametersByPath'],
								resources: [
									`arn:aws:ssm:${this.region}:${this.account}:parameter/${app!}/${stage}/${stack!}/*`,
								],
							}),
							// CloudWatch and logging permissions
							new iam.PolicyStatement({
								effect: iam.Effect.ALLOW,
								actions: [
									'logs:CreateLogGroup',
									'logs:CreateLogStream',
									'logs:PutLogEvents',
									'cloudwatch:putMetricData',
								],
								resources: ['*'],
							}),
							// DynamoDB Stream permissions
							new iam.PolicyStatement({
								effect: iam.Effect.ALLOW,
								actions: [
									'dynamodb:GetRecords',
									'dynamodb:GetShardIterator',
									'dynamodb:DescribeStream',
									'dynamodb:ListStreams',
								],
								resources: [userSubscriptionsStreamArn],
							}),
							// SQS permissions for DLQ
							new iam.PolicyStatement({
								effect: iam.Effect.ALLOW,
								actions: [
									'sqs:DeleteMessage',
									'sqs:GetQueueAttributes',
									'sqs:ReceiveMessage',
									'sqs:SendMessage',
								],
								resources: [acquisitionsDeadLetterQueue.queueArn],
							}),
						],
					}),
				},
			},
		);

		// Soft Opt-In Acquisitions Lambda
		const softOptInAcquisitionsLambda = new GuLambdaFunction(
			this,
			'SoftOptInAcquisitionsLambda',
			{
				app: app!,
				runtime: lambda.Runtime.NODEJS_20_X,
				handler: 'soft-opt-in-acquisitions.handler',
				fileName: `${stack}/${stage}/${app!}-soft-opt-in-acquisitions/soft-opt-in-acquisitions.zip`,
				functionName: `${app!}-soft-opt-in-acquisitions-${stage}`,
				environment: {
					App: app!,
					Stack: stack!,
					Stage: stage!,
					DLQUrl: acquisitionsDeadLetterQueue.queueUrl,
				},
				description:
					'Trigger setting soft-opt-in consents and sending emails based on Dynamo events',
				memorySize: 512,
				timeout: Duration.seconds(60),
				role: softOptInAcquisitionsRole,
			},
		);

		// Add DynamoDB Stream event source to the lambda
		softOptInAcquisitionsLambda.addEventSource(
			new eventSources.DynamoEventSource(
				dynamodb.Table.fromTableArn(
					this,
					'UserSubscriptionsTable',
					userSubscriptionsStreamArn.replace(':stream/', ':table/'),
				),
				{
					startingPosition: lambda.StartingPosition.LATEST,
					maxRecordAge: Duration.seconds(28800), // 8 hours
				},
			),
		);

		// IAM Role for DLQ Processor Lambda
		const dlqProcessorRole = new iam.Role(this, 'DLQProcessorRole', {
			assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
			managedPolicies: [
				iam.ManagedPolicy.fromAwsManagedPolicyName(
					'service-role/AWSLambdaBasicExecutionRole',
				),
			],
			inlinePolicies: {
				DLQProcessorPolicy: new iam.PolicyDocument({
					statements: [
						// Allow assume role for membership account
						new iam.PolicyStatement({
							effect: iam.Effect.ALLOW,
							actions: ['sts:AssumeRole'],
							resources: [
								`arn:aws:iam::${membershipAccountId}:role/membership-${softOptInConsentSetterStage}-soft-opt-in-consent-setter-QueueCrossAccountRole`,
								`arn:aws:iam::${membershipAccountId}:role/comms-${stage}-EmailQueueCrossAccountRole`,
							],
						}),
						// DynamoDB permissions for subscriptions table
						new iam.PolicyStatement({
							effect: iam.Effect.ALLOW,
							actions: ['dynamodb:Query', 'dynamodb:GetItem'],
							resources: [
								`arn:aws:dynamodb:${this.region}:${this.account}:table/${app!}-${stage}-subscriptions`,
								`arn:aws:dynamodb:${this.region}:${this.account}:table/${app!}-${stage}-subscriptions/*`,
							],
						}),
						// SSM permissions
						new iam.PolicyStatement({
							effect: iam.Effect.ALLOW,
							actions: ['ssm:GetParametersByPath'],
							resources: [
								`arn:aws:ssm:${this.region}:${this.account}:parameter/${app!}/${stage}/${stack!}/*`,
							],
						}),
						// CloudWatch and logging permissions
						new iam.PolicyStatement({
							effect: iam.Effect.ALLOW,
							actions: [
								'logs:CreateLogGroup',
								'logs:CreateLogStream',
								'logs:PutLogEvents',
								'cloudwatch:putMetricData',
							],
							resources: ['*'],
						}),
						// SQS permissions for DLQ
						new iam.PolicyStatement({
							effect: iam.Effect.ALLOW,
							actions: [
								'sqs:DeleteMessage',
								'sqs:GetQueueAttributes',
								'sqs:ReceiveMessage',
							],
							resources: ['*'], // Using wildcard as in original template
						}),
					],
				}),
			},
		});

		// DLQ Processor Lambda
		const dlqProcessorLambda = new GuLambdaFunction(
			this,
			'AcquisitionsDLQProcessorLambda',
			{
				app: app!,
				runtime: lambda.Runtime.NODEJS_20_X,
				handler: 'soft-opt-in-acquisitions-dlq-processor.handler',
				fileName: `${stack}/${stage}/${app!}-soft-opt-in-acquisitions-dlq-processor/soft-opt-in-acquisitions-dlq-processor.zip`,
				functionName: `${app!}-soft-opt-in-acquisitions-dlq-processor-${stage}`,
				environment: {
					App: app!,
					Stack: stack!,
					Stage: stage!,
					DLQUrl: acquisitionsDeadLetterQueue.queueUrl,
				},
				description: 'Process DLQ messages',
				memorySize: 512,
				timeout: Duration.seconds(60),
				role: dlqProcessorRole,
			},
		);

		// Schedule for DLQ Processor
		const schedule = stage === 'PROD' ? 'rate(6 hours)' : 'rate(6 hours)';

		const scheduledRule = new events.Rule(this, 'DLQProcessorSchedule', {
			schedule: events.Schedule.expression(schedule),
			description: 'Runs AcquisitionsDLQProcessorLambda',
			enabled: true,
		});

		scheduledRule.addTarget(new targets.LambdaFunction(dlqProcessorLambda));

		// CloudWatch Alarms (only for PROD)
		if (stage === 'PROD') {
			// Acquisitions Lambda Exceptions Alarm
			new cloudwatch.Alarm(this, 'AcquisitionsLambdaExceptionsAlarm', {
				alarmName: `${app!}-soft-opt-in-acquisitions-${stage} threw an unhandled exception and failed to set soft opt-ins for a user`,
				alarmDescription:
					'An error occurred in the SoftOptInAcquisitionsLambda and failed to set soft opt-ins for a user',
				metric: softOptInAcquisitionsLambda.metricErrors({
					period: Duration.hours(1),
					statistic: cloudwatch.Statistic.SUM,
				}),
				threshold: 1,
				comparisonOperator:
					cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				evaluationPeriods: 1,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			});

			// DLQ Processor Lambda Exceptions Alarm
			new cloudwatch.Alarm(this, 'AcquisitionsDlqProcessorExceptionsAlarm', {
				alarmName: `${app!}-soft-opt-ins-acquisitions-dlq-processor-${stage} threw an unhandled exception`,
				alarmDescription:
					'An error occurred in the AcquisitionsDLQProcessorLambda',
				metric: dlqProcessorLambda.metricErrors({
					period: Duration.hours(1),
					statistic: cloudwatch.Statistic.SUM,
				}),
				threshold: 1,
				comparisonOperator:
					cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
				evaluationPeriods: 1,
				treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
			});
		}

		// Outputs
		new CfnOutput(this, 'SoftOptInAcquisitionsLambdaArn', {
			value: softOptInAcquisitionsLambda.functionArn,
			description: 'ARN of the Soft Opt-In Acquisitions Lambda',
			exportName: `${app!}-${stage}-soft-opt-in-acquisitions-lambda-arn`,
		});

		new CfnOutput(this, 'AcquisitionsDLQProcessorLambdaArn', {
			value: dlqProcessorLambda.functionArn,
			description: 'ARN of the Acquisitions DLQ Processor Lambda',
			exportName: `${app!}-${stage}-acquisitions-dlq-processor-lambda-arn`,
		});

		new CfnOutput(this, 'AcquisitionsDeadLetterQueueArn', {
			value: acquisitionsDeadLetterQueue.queueArn,
			description: 'ARN of the Acquisitions Dead Letter Queue',
			exportName: `${app!}-${stage}-acquisitions-dlq-arn`,
		});
	}
}
