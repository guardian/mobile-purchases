import type { SQSRecord } from 'aws-lambda';
import { GracefulProcessingError } from './GracefulProcessingError';
import { ProcessingError } from './processingError';
import { subscriptionsFullTableName, type Subscription } from './subscription';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
	SQSClient,
	SendMessageCommand,
	SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

export async function putSubscription(
	subscription: Subscription,
): Promise<Subscription> {
	const tableName = subscriptionsFullTableName();

	const plainSubscription = {
		subscriptionId: subscription.subscriptionId,
		startTimestamp: subscription.startTimestamp,
		endTimestamp: subscription.endTimestamp,
		cancellationTimestamp: subscription.cancellationTimestamp,
		autoRenewing: subscription.autoRenewing,
		productId: subscription.productId,
		platform: subscription.platform,
		freeTrial: subscription.freeTrial,
		billingPeriod: subscription.billingPeriod,
		googlePayload: subscription.googlePayload,
		receipt: subscription.receipt,
		applePayload: subscription.applePayload,
		ttl: subscription.ttl,
		extra: subscription.extra,
	};

	await dynamoDbClient.send(
		new PutItemCommand({
			TableName: tableName,
			Item: marshall(plainSubscription, {
				removeUndefinedValues: true,
				convertClassInstanceToMap: true,
			}),
		}),
	);

	return subscription;
}

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

export async function queueHistoricalSubscription(
	subscription: Subscription,
): Promise<void> {
	const queueUrl = process.env.HistoricalQueueUrl;
	if (queueUrl === undefined) {
		throw new Error('No HistoricalQueueUrl env parameter provided');
	}

	const payload = subscription.googlePayload ?? subscription.applePayload;
	if (payload) {
		await sendToSqs(queueUrl, {
			subscriptionId: subscription.subscriptionId,
			snapshotDate: new Date().toISOString(),
			payload,
		});
	}
}

export async function parseAndStoreSubscriptionUpdate(
	sqsRecord: SQSRecord,
	fetchSubscriberDetails: (record: SQSRecord) => Promise<Subscription[]>,
): Promise<string> {
	try {
		const subscriptions = await fetchSubscriberDetails(sqsRecord); // Subscription[]
		await Promise.all(subscriptions.map(putSubscription));
		await Promise.all(subscriptions.map(queueHistoricalSubscription));
		console.log(
			`Processed ${subscriptions.length} subscriptions: ${subscriptions.map(
				(s) => s.subscriptionId,
			)}`,
		);
		return 'OK';
	} catch (error) {
		if (error instanceof ProcessingError) {
			console.error('Error processing the subscription update', error);
			if (error.shouldRetry) {
				console.error('Will throw an exception to retry this message');
				throw error;
			} else {
				console.error("The error wasn't retryable, giving up.");
				return 'Error, giving up';
			}
		} else if (error instanceof GracefulProcessingError) {
			console.warn(
				'Error processing the subscription update is being handled gracefully',
				error,
			);
			return 'OK';
		} else {
			console.error('Unexpected error, will throw to retry: ', error);
			throw error;
		}
	}
}
