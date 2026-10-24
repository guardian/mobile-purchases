import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Platform } from '../common/platform';
import {
	UserSubscription,
	userSubscriptionsFullTableName,
} from '../common/userSubscription';
import { HTTPResponses } from '../common/apiGatewayHttp';
import { ProcessingError } from '../common/processingError';
import type { SubscriptionReference } from '../common/subscriptionReference';
import { getAuthToken, getUserId } from '../common/guIdentityApi';
import type { UserIdResolution } from '../common/guIdentityApi';
import {
	DynamoDBClient,
	BatchGetItemCommand,
	BatchWriteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import type { SendMessageBatchRequestEntry } from '@aws-sdk/client-sqs';

// -----------------------------------------------------------------------------
// Globals

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

// -----------------------------------------------------------------------------
// Functions

export interface SubscriptionCheckData {
	subscriptionId: string;
	subscriptionReference: SubscriptionReference;
}

async function enqueueUnstoredPurchaseToken(
	subChecks: SubscriptionCheckData[],
): Promise<number> {
	// There's nothing to do if there are no subs to check - this will always be
	// the case for Feast.
	if (subChecks.length === 0) {
		return 0;
	}

	const tableName = userSubscriptionsFullTableName();

	const dynamoResult = await dynamoDbClient.send(
		new BatchGetItemCommand({
			RequestItems: {
				[tableName]: {
					Keys: subChecks.map((sub) => ({
						subscriptionId: { S: sub.subscriptionId },
					})),
				},
			},
		}),
	);

	type IndexedSubscriptionCheckData = Record<string, SubscriptionCheckData>;
	const indexedReferences: IndexedSubscriptionCheckData =
		subChecks.reduce<IndexedSubscriptionCheckData>((agg, value) => {
			agg[value.subscriptionId] = value;
			return agg;
		}, {});

	const responses = dynamoResult.Responses?.[tableName] ?? [];
	for (const item of responses) {
		const subId = item.subscriptionId?.S;
		if (subId) {
			delete indexedReferences[subId];
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

		const result = await sqsClient.send(
			new SendMessageBatchCommand({
				QueueUrl: queueUrl,
				Entries: sqsMessages,
			}),
		);

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

	await dynamoDbClient.send(
		new BatchWriteItemCommand({
			RequestItems: {
				[tableName]: userSubscriptions.map((sub) => ({
					PutRequest: {
						Item: marshall(sub, { removeUndefinedValues: true }),
					},
				})),
			},
		}),
	);

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

type AppleSubscription = {
	receipt: string;
	originalTransactionId: string;
};

type AppleLinkPayload = {
	platform:
		| Platform.DailyEdition
		| Platform.Ios
		| Platform.IosPuzzles
		| Platform.IosEdition
		| Platform.IosFeast;
	subscriptions: AppleSubscription[];
};

function deduplicate<T, U>(list: T[], selector: (item: T) => U): T[] {
	return list.reduce<T[]>(
		(agg, item) =>
			agg.some((x) => selector(x) === selector(item))
				? agg
				: agg.concat([item]),
		[],
	);
}

function parseAppleLinkPayload(
	request: APIGatewayProxyEvent,
): AppleLinkPayload {
	const parsed = JSON.parse(request.body ?? '') as AppleLinkPayload;
	return {
		...parsed,
		subscriptions: deduplicate(
			parsed.subscriptions,
			(x) => x.originalTransactionId,
		),
	};
}

function toUserSubscription(
	userId: string,
	payload: AppleLinkPayload,
): UserSubscription[] {
	const now = new Date().toISOString();
	return payload.subscriptions.map(
		(sub) => new UserSubscription(userId, sub.originalTransactionId, now),
	);
}

function toSqsPayload(payload: AppleLinkPayload): SubscriptionCheckData[] {
	// The link endpoint is used for iOS Feast in a specific scenario - where
	// the user takes out an IAP with a promo code. In this case we've found
	// that the appAccountToken, which we usually use for Feast to link users
	// with IAPs, isn't set. So instead in this specific scenario the Feast app
	// uses the link endpoint. The link endpoint does two things - it creates
	// the user subscription record, and also possibly queues the subscription
	// lookup (pushes onto the SQS queue for the update subs lambda). I don't
	// think this needs to happen for Feast. Furthermore, it's hard to support
	// because the credentials used for lookup in the non-Feast case are
	// different than other apps and in the update subs lambda we don't
	// currently know which app the subscription is for (hence having separate
	// lambdas for Feast and everything else). We _could_ push onto the Feast
	// update subs queue but we know that's going to fail in the user lookup
	// part, due to the aforementioned lack of appAccountToken. So I think the
	// easiest solution for now is just not to enqueue Feast subs for lookup.
	if (payload.platform === Platform.IosFeast) {
		console.log('Not enqueuing Feast subs for lookup');
		return [];
	}

	return payload.subscriptions.map((sub) => ({
		subscriptionId: sub.originalTransactionId,
		subscriptionReference: {
			receipt: sub.receipt,
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
		parseAppleLinkPayload,
		toUserSubscription,
		toSqsPayload,
	);
}
