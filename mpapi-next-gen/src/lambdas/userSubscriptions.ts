import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HTTPResponses } from '../common/apiGatewayHttp';
import type { Subscription } from '../common/subscription';
import { subscriptionsFullTableName } from '../common/subscription';
import { userSubscriptionsFullTableName } from '../common/userSubscription';
import { plusDays } from '../common/dates';
import type { UserIdResolution } from '../common/guIdentityApi';
import { getAuthToken, getUserId } from '../common/guIdentityApi';
import { mapPlatformToSoftOptInProductName } from '../common/softOptIns';
import { Platform } from '../common/platform';
import { getParameterValueUsingAppStageStackConvention } from '../common/ssmParameters';
import {
	DynamoDBClient,
	QueryCommand,
	BatchGetItemCommand,
	type QueryCommandOutput,
	type BatchGetItemCommandOutput,
} from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { Region } from '../common/appIdentity';

interface SubscriptionStatus {
	subscriptionId: string;
	from: string;
	to: string;
	cancellationTimestamp?: string | undefined;
	valid: boolean;
	gracePeriod: boolean;
	autoRenewing: boolean;
	productId: string;
	softOptInProductName: string;
	platform?: Platform;
}

interface SubscriptionStatusResponse {
	subscriptions: SubscriptionStatus[];
}

const dynamoClient = new DynamoDBClient({ region: Region });

async function getUserSubscriptionIds(userId: string): Promise<string[]> {
	const subs: string[] = [];
	const tableName = userSubscriptionsFullTableName();

	let lastEvaluatedKey: Record<string, any> | undefined = undefined;

	do {
		const response: QueryCommandOutput = await dynamoClient.send(
			new QueryCommand({
				TableName: tableName,
				KeyConditionExpression: 'userId = :userId',
				ExpressionAttributeValues: {
					':userId': { S: userId },
				},
				ExclusiveStartKey: lastEvaluatedKey,
			}),
		);

		if (response.Items) {
			for (const item of response.Items) {
				const unmarshalled = unmarshall(item);
				if (unmarshalled.subscriptionId) {
					subs.push(unmarshalled.subscriptionId);
				}
			}
		}

		lastEvaluatedKey = response.LastEvaluatedKey;
	} while (lastEvaluatedKey);

	return subs;
}

async function getSubscriptions(
	subscriptionIds: string[],
): Promise<SubscriptionStatusResponse> {
	if (subscriptionIds.length === 0) {
		return { subscriptions: [] };
	}

	const subs: Subscription[] = [];
	const tableName = subscriptionsFullTableName();

	const chunkSize = 100;
	for (let i = 0; i < subscriptionIds.length; i += chunkSize) {
		const chunk = subscriptionIds.slice(i, i + chunkSize);

		let requestItems = {
			[tableName]: {
				Keys: chunk.map((id) => ({
					subscriptionId: { S: id },
				})),
			},
		};

		let attempts = 0;
		while (
			requestItems[tableName] &&
			requestItems[tableName].Keys.length > 0 &&
			attempts < 5
		) {
			if (attempts > 0) {
				await new Promise((resolve) => setTimeout(resolve, attempts * 50));
			}

			const response: BatchGetItemCommandOutput = await dynamoClient.send(
				new BatchGetItemCommand({
					RequestItems: requestItems,
				}),
			);

			const items = response.Responses?.[tableName];
			if (items) {
				for (const item of items) {
					subs.push(unmarshall(item) as Subscription);
				}
			}

			requestItems = (response.UnprocessedKeys as any) || {};
			attempts++;
		}
	}

	const sortedSubs = subs.sort(
		(subscriptionA: Subscription, subscriptionB: Subscription) => {
			const endTimeA =
				(subscriptionA.endTimestamp &&
					Date.parse(subscriptionA.endTimestamp)) ||
				0;
			const endTimeB =
				(subscriptionB.endTimestamp &&
					Date.parse(subscriptionB.endTimestamp)) ||
				0;
			return endTimeA - endTimeB;
		},
	);

	const now = new Date();

	const subscriptionStatuses: SubscriptionStatus[] = sortedSubs.map((sub) => {
		const end = new Date(Date.parse(sub.endTimestamp));
		const endWithGracePeriod = plusDays(end, 30);
		const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();
		const gracePeriod: boolean = now.getTime() > end.getTime() && valid;

		return {
			subscriptionId: sub.subscriptionId,
			from: sub.startTimestamp,
			to: sub.endTimestamp,
			cancellationTimestamp: sub.cancellationTimestamp,
			valid: valid,
			gracePeriod: gracePeriod,
			autoRenewing: sub.autoRenewing,
			productId: sub.productId,
			softOptInProductName: mapPlatformToSoftOptInProductName(sub.platform),
			platform: sub.platform as Platform,
		};
	});

	return {
		subscriptions: subscriptionStatuses,
	};
}

async function apiKeysConfig(): Promise<string[]> {
	const apiKey0Default =
		await getParameterValueUsingAppStageStackConvention<string>(
			'user.api-key.0',
		);
	const apiKey1Salesforce =
		await getParameterValueUsingAppStageStackConvention<string>(
			'user.api-key.1.salesforce',
		);
	return [apiKey0Default, apiKey1Salesforce];
}

export async function handler(
	httpRequest: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
	try {
		const apiKeys = await apiKeysConfig();
		const authToken = getAuthToken(httpRequest.headers);

		let userId: string;

		if (authToken && apiKeys.includes(authToken)) {
			if (httpRequest.pathParameters && httpRequest.pathParameters['userId']) {
				userId = httpRequest.pathParameters['userId'];
			} else {
				return HTTPResponses.INVALID_REQUEST;
			}
		} else {
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
					userId = resolution.userId as string;
					break;
				}
			}
		}

		const userSubscriptionIds = await getUserSubscriptionIds(userId);
		const subscriptionStatuses = await getSubscriptions(userSubscriptionIds);

		return { statusCode: 200, body: JSON.stringify(subscriptionStatuses) };
	} catch (error) {
		console.log(`Error retrieving user subscriptions: ${error}`);
		return HTTPResponses.INTERNAL_ERROR;
	}
}
