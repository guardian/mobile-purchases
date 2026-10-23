import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Platform } from '../common/platform';
import { UserSubscription } from '../common/userSubscription';
import type { SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';
import { HTTPResponses } from '../common/apiGatewayHttp';
import { ProcessingError } from '../common/processingError';
import type { SubscriptionReference } from '../common/subscriptionReference';
import { getAuthToken, getUserId } from '../common/guIdentityApi';
import type { UserIdResolution } from '../common/guIdentityApi';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
	DynamoDBDocumentClient,
	BatchGetCommand,
	BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { Region } from '../common/appIdentity';
import { subscriptionsFullTableName } from '../common/subscription';
import { SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { userSubscriptionsFullTableName } from '../common/userSubscription';
import { SQSClient } from '@aws-sdk/client-sqs';

// -----------------------------------------------------------------------------
// Clients Initialization

const baseDynamoClient = new DynamoDBClient({ region: Region });
// The DocumentClient automatically extracts plain JS objects from your class structures
const dynamoClient = DynamoDBDocumentClient.from(baseDynamoClient, {
	marshallOptions: { removeUndefinedValues: true },
});
const sqsClient = new SQSClient({});

// -----------------------------------------------------------------------------
// Types

export interface SubscriptionCheckData {
	subscriptionId: string;
	subscriptionReference: SubscriptionReference;
}

// -----------------------------------------------------------------------------
// Functions

async function enqueueUnstoredPurchaseToken(
	subChecks: SubscriptionCheckData[],
): Promise<number> {
	// There's nothing to do if there are no subs to check - this will always be
	// the case for Feast.
	if (subChecks.length === 0) {
		return 0;
	}

	type IndexedSubscriptionCheckData = Record<string, SubscriptionCheckData>;
	const indexedReferences: IndexedSubscriptionCheckData =
		subChecks.reduce<IndexedSubscriptionCheckData>((agg, value) => {
			agg[value.subscriptionId] = value;
			return agg;
		}, {});

	let keysToFetch: Array<Record<string, any>> = subChecks.map((sub) => ({
		subscriptionId: sub.subscriptionId,
	}));
	const tableName = subscriptionsFullTableName();

	// same behaviour as the original mapper async iterator
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

		keysToFetch =
			(dynamoResult.UnprocessedKeys?.[tableName]?.Keys as Array<
				Record<string, any>
			>) ?? [];
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

async function persistUserSubscriptionLinks(
	userSubscriptions: UserSubscription[],
): Promise<number> {
	if (userSubscriptions.length === 0) {
		return 0;
	}

	const tableName = userSubscriptionsFullTableName();

	// Convert class instances directly to plain object syntax.
	// JSON parsing/stringifying strips internal class getter methods and symbols safely.
	let writeRequests = userSubscriptions.map((sub) => ({
		PutRequest: {
			Item: JSON.parse(JSON.stringify(sub)),
		},
	}));

	// Retry loop ensures UnprocessedItems are not silently dropped (restoring v2 Mapper safety)
	while (writeRequests.length > 0) {
		const command = new BatchWriteCommand({
			RequestItems: {
				[tableName]: writeRequests,
			},
		});

		const result = await dynamoClient.send(command);
		writeRequests = (result.UnprocessedItems?.[tableName] as any[]) ?? [];

		if (writeRequests.length > 0) {
			// Small backoff delay before retrying throttled items
			await new Promise((resolve) => setTimeout(resolve, 100));
		}
	}

	return userSubscriptions.length;
}

export async function parseAndStoreLink<A>(
	httpRequest: APIGatewayProxyEvent,
	parsePayload: (request: APIGatewayProxyEvent) => A,
	toUserSubscription: (userId: string, payload: A) => UserSubscription[],
	toSqsPayload: (payload: A) => SubscriptionCheckData[],
): Promise<APIGatewayProxyResult> {
	try {
		console.log(`Input to link lambda is ${JSON.stringify(httpRequest)}`);
		if (httpRequest.headers && getAuthToken(httpRequest.headers)) {
			const payload: A = parsePayload(httpRequest);
			const resolution: UserIdResolution = await getUserId(httpRequest.headers);
			switch (resolution.status) {
				case 'incorrect-token': {
					return HTTPResponses.UNAUTHORISED;
				}
				case 'incorrect-scope': {
					return HTTPResponses.FORBIDDEN;
				}
				case 'missing-identity-id': {
					return HTTPResponses.INVALID_REQUEST;
				}
				case 'success': {
					const userId = resolution.userId as string;
					const insertCount = await persistUserSubscriptionLinks(
						toUserSubscription(userId, payload),
					);
					const sqsCount = await enqueueUnstoredPurchaseToken(
						toSqsPayload(payload),
					);
					console.log(
						`put ${insertCount} links in the DB, and sent ${sqsCount} subscription refs to SQS`,
					);
					return HTTPResponses.OK;
				}
			}
		} else {
			return HTTPResponses.INVALID_REQUEST;
		}
	} catch (error) {
		console.error('Internal Server Error', error);
		const message = (error as Error).message;
		if (
			typeof message === 'string' &&
			message.includes('Provided list of item keys contains duplicates')
		) {
			console.error('Request body: ' + (httpRequest.body ?? ''));
		}
		return HTTPResponses.INTERNAL_ERROR;
	}
}

type GoogleSubscription = {
	purchaseToken: string;
	subscriptionId: string;
};

type GoogleLinkPayload = {
	platform:
		| Platform.Android
		| Platform.AndroidPuzzles
		| Platform.AndroidEdition;
	subscriptions: GoogleSubscription[];
};

export function parseGoogleLinkPayload(
	request: APIGatewayProxyEvent,
): GoogleLinkPayload {
	return JSON.parse(request.body ?? '') as GoogleLinkPayload;
}

function toUserSubscription(
	userId: string,
	payload: GoogleLinkPayload,
): UserSubscription[] {
	return payload.subscriptions.map(
		(sub) =>
			new UserSubscription(userId, sub.purchaseToken, new Date().toISOString()),
	);
}

function platformToPackage(platform: Platform): string {
	switch (platform) {
		case Platform.Android:
			return 'com.guardian';
		case Platform.AndroidPuzzles:
			return 'uk.co.guardian.puzzles';
		case Platform.AndroidEdition:
			return 'com.guardian.editions';
		default:
			throw new Error(`Invalid platform`);
	}
}

function toSqsPayload(payload: GoogleLinkPayload): SubscriptionCheckData[] {
	return payload.subscriptions.map((sub) => ({
		subscriptionId: sub.purchaseToken,
		subscriptionReference: {
			packageName: platformToPackage(payload.platform),
			purchaseToken: sub.purchaseToken,
			subscriptionId: sub.subscriptionId,
		},
	}));
}

// -----------------------------------------------------------------------------
// Handler

export async function handler(
	httpRequest: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
	return parseAndStoreLink(
		httpRequest,
		parseGoogleLinkPayload,
		toUserSubscription,
		toSqsPayload,
	);
}
