import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Platform } from '../common/platform';
import { UserSubscription } from '../common/userSubscription';
import { HTTPResponses } from '../common/apiGatewayHttp';
import { getAuthToken, getUserId } from '../common/guIdentityApi';
import type { UserIdResolution } from '../common/guIdentityApi';
import {
	enqueueUnstoredPurchaseTokenShared,
	persistUserSubscriptionLinksShared,
} from '../common/sharedLink';
import type { SubscriptionCheckData } from '../common/sharedLink';

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
					const insertCount = await persistUserSubscriptionLinksShared(
						toUserSubscription(userId, payload),
					);
					const sqsCount = await enqueueUnstoredPurchaseTokenShared(
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

export function parseAppleLinkPayload(
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

export function toUserSubscription(
	userId: string,
	payload: AppleLinkPayload,
): UserSubscription[] {
	const now = new Date().toISOString();
	return payload.subscriptions.map(
		(sub) => new UserSubscription(userId, sub.originalTransactionId, now),
	);
}

export function toSqsPayload(
	payload: AppleLinkPayload,
): SubscriptionCheckData[] {
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
