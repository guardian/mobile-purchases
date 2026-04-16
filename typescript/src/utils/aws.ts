import { DataMapper } from '@aws/dynamodb-data-mapper';
import {
	CloudWatchClient,
	PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
	SQSClient,
	SendMessageCommand,
	type SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import { SSMClient } from '@aws-sdk/client-ssm';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { Region, Stage } from './appIdentity';
import { getMembershipAccountId } from './guIdentityApi';
import type { SoftOptInEventProductName } from './softOptIns';
import { defaultProvider } from '@aws-sdk/credential-provider-node';

// Use the credential provider directly - it will be called when needed
export const aws = new DynamoDBClient({
	region: Region,
	credentials: defaultProvider(),
});

export const dynamoMapper = new DataMapper({ client: aws });

export const sqs = new SQSClient({
	region: Region,
	credentials: defaultProvider(),
});

let SOISqsClient: SQSClient | undefined;
let commsSqsClient: SQSClient | undefined;

let lastAssumedSOI: Date | undefined;
let lastAssumedComms: Date | undefined;

async function getSqsClientForSoftOptIns(): Promise<SQSClient> {
	const now = new Date();
	if (
		!SOISqsClient ||
		!lastAssumedSOI ||
		now.getTime() - lastAssumedSOI.getTime() >= 1800000
	) {
		// refresh every 30 minutes
		const membershipAccountId = await getMembershipAccountId();
		const sts = new STSClient({ region: Region });

		const softOptInConsentSetterStage = Stage === 'PROD' ? 'PROD' : 'CODE';

		const assumeRoleCommand = new AssumeRoleCommand({
			RoleArn: `arn:aws:iam::${membershipAccountId}:role/membership-${softOptInConsentSetterStage}-soft-opt-in-consent-setter-QueueCrossAccountRole`,
			RoleSessionName: 'CrossAccountSession',
		});

		const assumeRoleResult = await sts.send(assumeRoleCommand);

		const credentials = assumeRoleResult.Credentials;

		if (
			!credentials ||
			!credentials.AccessKeyId ||
			!credentials.SecretAccessKey
		) {
			throw Error('credentials undefined in getSqsClientForSoftOptIns');
		}

		SOISqsClient = new SQSClient({
			region: Region,
			credentials: {
				accessKeyId: credentials.AccessKeyId,
				secretAccessKey: credentials.SecretAccessKey,
				sessionToken: credentials.SessionToken,
			},
		});

		lastAssumedSOI = now;
	}

	return SOISqsClient;
}

async function getSqsClientForComms(): Promise<SQSClient> {
	const now = new Date();
	if (
		!commsSqsClient ||
		!lastAssumedComms ||
		now.getTime() - lastAssumedComms.getTime() >= 1800000
	) {
		// refresh every 30 minutes
		const membershipAccountId = await getMembershipAccountId();
		const sts = new STSClient({ region: Region });

		const assumeRoleCommand = new AssumeRoleCommand({
			RoleArn: `arn:aws:iam::${membershipAccountId}:role/comms-${Stage}-EmailQueueCrossAccountRole`,
			RoleSessionName: 'CrossAccountSession',
		});

		const assumeRoleResult = await sts.send(assumeRoleCommand);

		const credentials = assumeRoleResult.Credentials;

		if (
			!credentials ||
			!credentials.AccessKeyId ||
			!credentials.SecretAccessKey
		) {
			throw Error('credentials undefined in getSqsClientForComms');
		}

		commsSqsClient = new SQSClient({
			region: Region,
			credentials: {
				accessKeyId: credentials.AccessKeyId,
				secretAccessKey: credentials.SecretAccessKey,
				sessionToken: credentials.SessionToken,
			},
		});

		lastAssumedComms = now;
	}

	return commsSqsClient;
}

export const s3: S3Client = new S3Client({
	region: Region,
	credentials: defaultProvider(),
});

export const ssm: SSMClient = new SSMClient({
	region: Region,
	credentials: defaultProvider(),
});

const cloudWatchClient = new CloudWatchClient({ region: Region });

export async function putMetric(
	metricName: string,
	value = 1.0,
): Promise<void> {
	const command = new PutMetricDataCommand({
		Namespace: 'soft-opt-ins',
		MetricData: [
			{
				MetricName: metricName,
				Unit: 'Count',
				Value: value,
				Dimensions: [
					{
						Name: 'Stage',
						Value: Stage,
					},
				],
			},
		],
	});

	await cloudWatchClient.send(command);
}

export async function sendToSqs(
	queueUrl: string,
	event: unknown,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	const command = new SendMessageCommand({
		QueueUrl: queueUrl,
		MessageBody: JSON.stringify(event),
		DelaySeconds: delaySeconds,
	});
	return sqs.send(command);
}

export interface SoftOptInEvent {
	identityId: string;
	eventType: 'Acquisition' | 'Cancellation' | 'Switch';
	productName: SoftOptInEventProductName;
	subscriptionId: string;
}

export async function sendToSqsSoftOptIns(
	queueUrl: string,
	event: SoftOptInEvent,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	const membershipSqs = await getSqsClientForSoftOptIns();
	const command = new SendMessageCommand({
		QueueUrl: queueUrl,
		MessageBody: JSON.stringify(event),
		DelaySeconds: delaySeconds,
	});
	return membershipSqs.send(command);
}

export async function sendToSqsComms(
	queueUrl: string,
	event: unknown,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	const membershipSqs = await getSqsClientForComms();
	const command = new SendMessageCommand({
		QueueUrl: queueUrl,
		MessageBody: JSON.stringify(event),
		DelaySeconds: delaySeconds,
	});
	return membershipSqs.send(command);
}
