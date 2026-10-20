import 'source-map-support/register';
import { createHash } from 'crypto';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type {
	HttpRequestHeaders,
	PathParameters,
} from '../models/apiGatewayHttp';
import { HTTPResponses } from '../models/apiGatewayHttp';
import { SubscriptionEmpty } from '../models/subscription';
import { fetchGoogleSubscription } from '../services/google-play';
import { dynamoMapper } from '../utils/aws';
import { optionalMsToDate } from '../utils/dates';

type SubscriptionStatus = {
	subscriptionHasLapsed: boolean;
	subscriptionExpiryDate: Date;
};

function getPurchaseToken(headers: HttpRequestHeaders): string | undefined {
	return headers['Play-Purchase-Token'] ?? headers['play-purchase-token'];
}

function getSubscriptionId(
	parameters: PathParameters | null,
): string | undefined {
	return parameters?.subscriptionId;
}

function googlePackageName(headers: HttpRequestHeaders): string {
	const packageNameFromHeaders =
		headers['Package-Name'] ?? headers['package-name'];
	if (packageNameFromHeaders) {
		return packageNameFromHeaders;
	} else {
		return 'com.guardian';
	}
}

export async function handler(
	request: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> {
	const purchaseToken = getPurchaseToken(request.headers);
	const subscriptionId = getSubscriptionId(request.pathParameters);
	const packageName = googlePackageName(request.headers);

	if (purchaseToken && subscriptionId) {
		const purchaseTokenHash = createHash('sha256')
			.update(purchaseToken)
			.digest('hex');
		console.log(
			`[4814d85a] searching for valid ${subscriptionId} subscription for Android app with package name: ${packageName}, for purchaseToken hash: ${purchaseTokenHash}`,
		);
		try {
			const subscriptionStatus =
				(await getSubscriptionStatusFromDynamo(
					purchaseToken,
					purchaseTokenHash,
				)) ??
				(await getSubscriptionStatusFromGoogle(
					subscriptionId,
					purchaseToken,
					packageName,
					purchaseTokenHash,
				));

			if (subscriptionStatus !== null) {
				return { statusCode: 200, body: JSON.stringify(subscriptionStatus) };
			} else {
				console.log(
					`[f22b782f] no subscription found for purchaseToken hash: ${purchaseTokenHash}`,
				);
				return HTTPResponses.NOT_FOUND;
			}
		} catch (error: unknown) {
			const err = error as { statusCode?: number };
			if (err.statusCode == 410) {
				console.log(
					`[5c5abf00] no subscription found for purchaseToken hash: ${purchaseTokenHash} (410-Gone from upstream API)`,
				);
				return HTTPResponses.NOT_FOUND;
			} else {
				console.log(
					`[44aeccc7] serving an Internal Server Error due to: ${err.toString().split('/tokens/')[0]}`,
				);
				return HTTPResponses.INTERNAL_ERROR;
			}
		}
	} else {
		return HTTPResponses.INVALID_REQUEST;
	}
}

async function getSubscriptionStatusFromGoogle(
	subscriptionId: string,
	purchaseToken: string,
	packageName: string,
	purchaseTokenHash: string,
): Promise<SubscriptionStatus | null> {
	console.log(
		`Fetching subscription from Google for purchaseToken hash: ${purchaseTokenHash}`,
	);
	const subscription = await fetchGoogleSubscription(
		subscriptionId,
		purchaseToken,
		packageName,
	);
	const subscriptionExpiryDate = optionalMsToDate(
		subscription?.expiryTimeMillis,
	);
	const googleSubscriptionStatus = subscriptionExpiryDate
		? subscriptionStatus(subscriptionExpiryDate)
		: null;
	console.log(
		`Google SubscriptionStatus for purchaseToken hash: ${purchaseTokenHash}: ${JSON.stringify(
			googleSubscriptionStatus,
		)}`,
	);
	return googleSubscriptionStatus;
}

async function getSubscriptionStatusFromDynamo(
	purchaseToken: string,
	purchaseTokenHash: string,
): Promise<SubscriptionStatus | null> {
	try {
		console.log(
			`[3db5157b] fetching subscription from Dynamo for purchaseToken hash: ${purchaseTokenHash}`,
		);
		const itemToQuery = new SubscriptionEmpty();
		itemToQuery.setSubscriptionId(purchaseToken);
		const subscription = await dynamoMapper.get(itemToQuery);
		const subscriptionExpiryDate = new Date(subscription.endTimestamp);
		const dynamoSubscriptionStatus = subscriptionStatus(subscriptionExpiryDate);
		console.log(
			`[58de59d8] dynamo SubscriptionStatus for purchaseToken hash: ${purchaseTokenHash}: ${JSON.stringify(
				dynamoSubscriptionStatus,
			)}`,
		);
		return dynamoSubscriptionStatus;
	} catch (error: unknown) {
		const err = error as { name?: string };
		if (err.name === 'ItemNotFoundException') {
			console.log(
				`[9e038a90] no subscription found in Dynamo with purchaseToken hash: ${purchaseTokenHash}`,
			);
		} else {
			console.log(
				`[ff0d8bf2] the following Dynamo error occurred when attempting to retrieve a subscription with purchaseToken hash: ${purchaseTokenHash}: ${error}`,
			);
		}
		// All exceptions are swallowed here as we fall-back on the Google API for all failure modes (including cache misses)
		return null;
	}
}

function subscriptionStatus(expiryDate: Date): SubscriptionStatus {
	const now = new Date(Date.now());
	return {
		subscriptionHasLapsed: now > expiryDate,
		subscriptionExpiryDate: expiryDate,
	};
}
