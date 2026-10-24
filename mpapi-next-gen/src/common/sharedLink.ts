import { ProcessingError } from '../common/processingError';
import type { SubscriptionReference } from '../common/subscriptionReference';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	BatchGetCommand,
	BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import type { SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import { Region } from '../common/appIdentity';
import { subscriptionsFullTableName } from '../common/subscription';
import { userSubscriptionsFullTableName } from '../common/userSubscription';
import { UserSubscription } from '../common/userSubscription';

const baseDynamoClient = new DynamoDBClient({ region: Region });
const dynamoClient = DynamoDBDocumentClient.from(baseDynamoClient, {
	marshallOptions: { removeUndefinedValues: true },
});
const sqsClient = new SQSClient({});

const BATCH_GET_LIMIT = 100;
const BATCH_WRITE_LIMIT = 25;
const SQS_BATCH_LIMIT = 10;

const MAX_UNPROCESSED_RETRIES = 5;
const UNPROCESSED_RETRY_DELAY_MS = 100;

export interface SubscriptionCheckData {
	subscriptionId: string;
	subscriptionReference: SubscriptionReference;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function enqueueUnstoredPurchaseTokenShared(
	subChecks: SubscriptionCheckData[],
): Promise<number> {
	if (subChecks.length === 0) {
		return 0;
	}

	type IndexedSubscriptionCheckData = Record<string, SubscriptionCheckData>;
	const indexedReferences: IndexedSubscriptionCheckData =
		subChecks.reduce<IndexedSubscriptionCheckData>((agg, value) => {
			agg[value.subscriptionId] = value;
			return agg;
		}, {});

	const initialKeysToFetch: Array<Record<string, any>> = subChecks.map(
		(sub) => ({
			subscriptionId: sub.subscriptionId,
		}),
	);

	const tableName = subscriptionsFullTableName();

	for (let i = 0; i < initialKeysToFetch.length; i += BATCH_GET_LIMIT) {
		let keysToFetch = initialKeysToFetch.slice(i, i + BATCH_GET_LIMIT);
		let attempt = 0;

		while (keysToFetch.length > 0) {
			if (attempt > 0 && attempt > MAX_UNPROCESSED_RETRIES) {
				throw new ProcessingError(
					`Exceeded ${MAX_UNPROCESSED_RETRIES} retries fetching subscriptions; ${keysToFetch.length} keys still unprocessed`,
					true,
				);
			}

			const command = new BatchGetCommand({
				RequestItems: {
					[tableName]: {
						Keys: keysToFetch,
					},
				},
			});

			const dynamoResult = await dynamoClient.send(command);
			const items = dynamoResult.Responses?.[tableName] ?? [];

			for (const item of items) {
				delete indexedReferences[item.subscriptionId];
			}

			keysToFetch =
				(dynamoResult.UnprocessedKeys?.[tableName]?.Keys as Array<
					Record<string, any>
				>) ?? [];

			if (keysToFetch.length > 0) {
				attempt += 1;
				await sleep(UNPROCESSED_RETRY_DELAY_MS);
			}
		}
	}

	const refsToSend = Object.values(indexedReferences).map(
		(value) => value.subscriptionReference,
	);

	if (refsToSend.length === 0) {
		return 0;
	}

	const queueUrl = process.env.QueueUrl;
	if (queueUrl === undefined) {
		throw new Error('No QueueUrl env parameter provided');
	}

	let successCount = 0;
	for (let i = 0; i < refsToSend.length; i += SQS_BATCH_LIMIT) {
		const chunk = refsToSend.slice(i, i + SQS_BATCH_LIMIT);
		const sqsMessages: SendMessageBatchRequestEntry[] = chunk.map(
			(subRef, index) => ({
				Id: index.toString(),
				MessageBody: JSON.stringify(subRef),
			}),
		);

		const command = new SendMessageBatchCommand({
			QueueUrl: queueUrl,
			Entries: sqsMessages,
		});

		const result = await sqsClient.send(command);

		if (result.Failed && result.Failed.length > 0) {
			throw new ProcessingError(
				'Unable to send all the subscription reference to SQS, will retry',
				true,
			);
		}

		successCount += result.Successful?.length ?? 0;
	}

	return successCount;
}

export async function persistUserSubscriptionLinksShared(
	userSubscriptions: UserSubscription[],
): Promise<number> {
	if (userSubscriptions.length === 0) {
		return 0;
	}

	const tableName = userSubscriptionsFullTableName();

	const allWriteRequests = userSubscriptions.map((sub) => ({
		PutRequest: {
			Item: {
				userId: sub.userId,
				subscriptionId: sub.subscriptionId,
				creationTimestamp: sub.creationTimestamp,
			},
		},
	}));

	for (let i = 0; i < allWriteRequests.length; i += BATCH_WRITE_LIMIT) {
		let writeRequests = allWriteRequests.slice(i, i + BATCH_WRITE_LIMIT);
		let attempt = 0;

		while (writeRequests.length > 0) {
			if (attempt > 0 && attempt > MAX_UNPROCESSED_RETRIES) {
				throw new ProcessingError(
					`Exceeded ${MAX_UNPROCESSED_RETRIES} retries writing user subscriptions; ${writeRequests.length} items still unprocessed`,
					true,
				);
			}

			const command = new BatchWriteCommand({
				RequestItems: {
					[tableName]: writeRequests,
				},
			});

			const result = await dynamoClient.send(command);
			writeRequests = (result.UnprocessedItems?.[tableName] as any[]) ?? [];

			if (writeRequests.length > 0) {
				attempt += 1;
				await sleep(UNPROCESSED_RETRY_DELAY_MS);
			}
		}
	}

	return userSubscriptions.length;
}
