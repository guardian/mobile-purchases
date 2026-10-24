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

export interface SubscriptionCheckData {
	subscriptionId: string;
	subscriptionReference: SubscriptionReference;
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

	const BATCH_GET_LIMIT = 100;
	for (let i = 0; i < initialKeysToFetch.length; i += BATCH_GET_LIMIT) {
		let keysToFetch = initialKeysToFetch.slice(i, i + BATCH_GET_LIMIT);

		while (keysToFetch.length > 0) {
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

			// FIX: Keep the safe cast so that subsequent loop evaluations match the parent collection type
			keysToFetch =
				(dynamoResult.UnprocessedKeys?.[tableName]?.Keys as Array<
					Record<string, any>
				>) ?? [];
		}
	}

	const refsToSend = Object.values(indexedReferences).map(
		(value) => value.subscriptionReference,
	);

	if (refsToSend.length > 0) {
		const queueUrl = process.env.QueueUrl;
		if (queueUrl === undefined) {
			throw new Error('No QueueUrl env parameter provided');
		}

		const sqsMessages: SendMessageBatchRequestEntry[] = refsToSend.map(
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
		return result.Successful?.length ?? 0;
	} else {
		return 0;
	}
}

export async function persistUserSubscriptionLinksShared(
	userSubscriptions: UserSubscription[],
): Promise<number> {
	if (userSubscriptions.length === 0) {
		return 0;
	}

	const tableName = userSubscriptionsFullTableName();

	// FIX: Explicitly map to a plain persistence object using creationTimestamp
	const allWriteRequests = userSubscriptions.map((sub) => ({
		PutRequest: {
			Item: {
				userId: sub.userId,
				subscriptionId: sub.subscriptionId,
				creationTimestamp: sub.creationTimestamp,
			},
		},
	}));

	// Guarded by the BatchWrite 25-item physical threshold
	const BATCH_WRITE_LIMIT = 25;
	for (let i = 0; i < allWriteRequests.length; i += BATCH_WRITE_LIMIT) {
		let writeRequests = allWriteRequests.slice(i, i + BATCH_WRITE_LIMIT);
		while (writeRequests.length > 0) {
			const command = new BatchWriteCommand({
				RequestItems: {
					[tableName]: writeRequests,
				},
			});

			const result = await dynamoClient.send(command);
			writeRequests = (result.UnprocessedItems?.[tableName] as any[]) ?? [];

			if (writeRequests.length > 0) {
				await new Promise((resolve) => setTimeout(resolve, 100));
			}
		}
	}

	return userSubscriptions.length;
}
