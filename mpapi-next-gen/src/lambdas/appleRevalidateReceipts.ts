import 'source-map-support/register';

// TODO: Rename this.
//       We already have a Subscription object.
import { Subscription as EndTimeStampFilterSubscription } from '../common/endTimestampFilter';

import { subscriptionsFullTableName } from '../common/subscription';
import { Platform } from '../common/platform';
import type {
	AppleSubscriptionReference,
	SubscriptionReference,
} from '../common/subscriptionReference';
import { plusDays, plusHours } from '../common/dates';

import {
	DynamoDBClient,
	ScanCommand,
	ScanCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
	SQSClient,
	SendMessageCommand,
	SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';

// -----------------------------------------------------------------------------
// Types

export interface ScheduleEvent {
	endTimestampFilter?: string;
	startTimestampFilter?: string;
}

// -----------------------------------------------------------------------------
// Globals

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

// -----------------------------------------------------------------------------
// Functions

function sendToSqs(
	queueUrl: string,
	event: unknown,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	return sqsClient.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(event),
			DelaySeconds: delaySeconds,
		}),
	);
}

function endTimestampForQuery(event: ScheduleEvent): Date {
	if (event.endTimestampFilter) {
		return new Date(Date.parse(event.endTimestampFilter));
	} else {
		return plusHours(new Date(), 13);
	}
}

function startTimestampForQuery(event: ScheduleEvent): Date {
	if (event.startTimestampFilter) {
		return new Date(Date.parse(event.startTimestampFilter));
	} else {
		return plusDays(new Date(), -60);
	}
}

const queueUrlForPlatform = (platform: string): string => {
	const LiveAppSqsUrl = process.env.LiveAppSqsUrl;
	if (LiveAppSqsUrl === undefined) {
		throw new Error('No LiveAppSqsUrl env parameter provided');
	}

	const FeastAppSqsUrl = process.env.FeastAppSqsUrl;
	if (FeastAppSqsUrl === undefined) {
		throw new Error('No FeastAppSqsUrl env parameter provided');
	}

	switch (platform) {
		case Platform.IosFeast:
			return FeastAppSqsUrl;
		default:
			return LiveAppSqsUrl;
	}
};

async function* defaultSubscriptions(
	event: ScheduleEvent,
): AsyncIterable<EndTimeStampFilterSubscription> {
	const startTimestamp = startTimestampForQuery(event).toISOString();
	const endTimestamp = endTimestampForQuery(event).toISOString();
	console.log(`Will filter subscriptions before ${endTimestamp}`);

	const tableName = subscriptionsFullTableName();
	let lastEvaluatedKey: Record<string, any> | undefined = undefined;

	do {
		const response: ScanCommandOutput = await dynamoDbClient.send(
			new ScanCommand({
				TableName: tableName,
				IndexName: 'ios-endTimestamp-revalidation-index-with-platform',
				FilterExpression:
					'autoRenewing = :autoRenewing AND attribute_exists(receipt) AND endTimestamp < :endTimestamp AND endTimestamp > :startTimestamp',
				ExpressionAttributeValues: {
					':autoRenewing': { BOOL: true },
					':endTimestamp': { S: endTimestamp },
					':startTimestamp': { S: startTimestamp },
				},
				ExclusiveStartKey: lastEvaluatedKey,
			}),
		);

		if (response.Items) {
			for (const item of response.Items) {
				yield unmarshall(item) as EndTimeStampFilterSubscription;
			}
		}

		lastEvaluatedKey = response.LastEvaluatedKey;
	} while (lastEvaluatedKey);
}

const defaultSendSubscriptionReferenceToQueue = async (
	queue: string,
	ref: SubscriptionReference,
	delayInSeconds: number,
): Promise<void> => {
	await sendToSqs(queue, ref, delayInSeconds);
};

export function buildHandler(
	subscriptions: (
		event: ScheduleEvent,
	) => AsyncIterable<EndTimeStampFilterSubscription> = defaultSubscriptions,
	sendSubscriptionReferenceToQueue: (
		queue: string,
		ref: SubscriptionReference,
		delayInSeconds: number,
	) => Promise<void> = defaultSendSubscriptionReferenceToQueue,
): (event: ScheduleEvent) => Promise<void> {
	return async (event: ScheduleEvent) => {
		const sendCounts = { feast: 0, 'non-feast': 0 };
		for await (const subscription of subscriptions(event)) {
			const receipt: string | undefined = subscription.receipt;
			if (receipt) {
				const subscriptionReference: AppleSubscriptionReference = {
					receipt: receipt,
				};
				const countKey =
					subscription.platform == Platform.IosFeast ? 'feast' : 'non-feast';
				const delayInSeconds = Math.min(
					Math.floor(sendCounts[countKey] / 10),
					900,
				);
				const sqsUrl = queueUrlForPlatform(subscription.platform);
				await sendSubscriptionReferenceToQueue(
					sqsUrl,
					subscriptionReference,
					delayInSeconds,
				);
				sendCounts[countKey]++;
				console.log(
					`Sent ${subscription.platform} subscription with id: ${subscription.subscriptionId} and expiry timestamp: ${subscription.endTimestamp}`,
				);
			} else {
				console.warn(`No receipt found for ${subscription.subscriptionId}`);
			}
		}
		console.log(
			`Sent ${sendCounts['non-feast']} non-Feast subscriptions and ${sendCounts['feast']} Feast subscriptions to be re-validated.`,
		);
	};
}

// -----------------------------------------------------------------------------
// Handler

export const handler = buildHandler();
