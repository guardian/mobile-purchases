import 'source-map-support/register';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { ProcessingError } from '../common/processingError';
import {
	Subscription,
	subscriptionsFullTableName,
} from '../common/subscription';
import type { GoogleSubscriptionReference } from '../common/subscriptionReference';
import { googlePackageNameToPlatform } from '../common/appToPlatform';
import type { GoogleResponseBody } from '../common/google-play';
import {
	fetchGoogleSubscription,
	GOOGLE_PAYMENT_STATE,
} from '../common/google-play';
import type { GoogleExtraDataExtended } from '../common/google-subscription-extra';
import { extraction } from '../common/google-subscription-extra';
import { PRODUCT_BILLING_PERIOD } from '../common/productBillingPeriod';
import { Stage } from '../common/appIdentity';
import {
	dateToSecondTimestamp,
	optionalMsToDate,
	thirtyMonths,
} from '../common/dates';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { GracefulProcessingError } from '../common/GracefulProcessingError';

// -----------------------------------------------------------------------------
// Globals

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

// -----------------------------------------------------------------------------
// Functions

export async function putSubscription(
	subscription: Subscription,
): Promise<Subscription> {
	const command = new PutItemCommand({
		TableName: subscriptionsFullTableName(),
		Item: marshall(subscription, { removeUndefinedValues: true }),
	});
	await dynamoDbClient.send(command);
	return subscription;
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
		const messageBody = {
			subscriptionId: subscription.subscriptionId,
			snapshotDate: new Date().toISOString(),
			payload,
		};
		const command = new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(messageBody),
		});
		await sqsClient.send(command);
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

export const googleResponseBodyToSubscription = async (
	purchaseToken: string,
	packageName: string,
	subscriptionId: string,
	billingPeriod: string,
	shouldBuildExtra: boolean,
	googleResponse: GoogleResponseBody | null,
): Promise<Subscription> => {
	if (!googleResponse) {
		throw new ProcessingError(
			'There was no data in the response from google',
			true,
		);
	}

	const expiryDate = optionalMsToDate(googleResponse.expiryTimeMillis);
	if (expiryDate === null) {
		throw new ProcessingError(
			`Unable to parse the expiryTimeMillis field ${googleResponse.expiryTimeMillis}`,
			false,
		);
	}

	const startDate = optionalMsToDate(googleResponse.startTimeMillis);
	if (startDate === null) {
		throw new ProcessingError(
			`Unable to parse the startTimeMillis field ${googleResponse.startTimeMillis}`,
			false,
		);
	}

	const freeTrial =
		googleResponse.paymentState === GOOGLE_PAYMENT_STATE.FREE_TRIAL;

	// We are instantiating one value, which is going to be set if we manage to construct a extra object
	let extra = '';

	if (shouldBuildExtra) {
		// Guarded by `shouldBuildExtra` because we do not want this to run from the automated tests

		const productId = subscriptionId; // [1]
		// [1]
		// What is called `subscriptionId` in the notification is actually a productId.
		// An example of notification is
		// {
		//     "packageName": "uk.co.guardian.feast",
		//     "purchaseToken": "Example-kokmikjooafaEUsuLAO3RKjfwtmyQ",
		//     "subscriptionId": "uk.co.guardian.feast.access"
		//}
		// See docs/google-identifiers.md for details

		const data: GoogleExtraDataExtended | undefined = await extraction(
			Stage,
			packageName,
			purchaseToken,
			productId,
		);

		if (data !== undefined) {
			extra = JSON.stringify(data.extra);
			console.log(`[df099cfb] ${extra}`);
		}
	}

	const subscription = new Subscription(
		purchaseToken,
		startDate.toISOString(),
		expiryDate.toISOString(),
		optionalMsToDate(googleResponse.userCancellationTimeMillis)?.toISOString(),
		googleResponse.autoRenewing,
		subscriptionId,
		googlePackageNameToPlatform(packageName)?.toString(),
		freeTrial,
		billingPeriod,
		googleResponse,
		undefined,
		null,
		dateToSecondTimestamp(thirtyMonths(expiryDate)),
		extra, // extra metadata
	);

	return Promise.resolve(subscription);
};

export async function getGoogleSubResponse(
	record: SQSRecord,
	shouldBuildExtra: boolean,
): Promise<Subscription[]> {
	const subscriptionReference = JSON.parse(
		record.body,
	) as GoogleSubscriptionReference;

	let response;
	try {
		response = await fetchGoogleSubscription(
			subscriptionReference.subscriptionId,
			subscriptionReference.purchaseToken,
			subscriptionReference.packageName,
		);
	} catch (exception: unknown) {
		const err = exception as {
			statusCode?: number;
			result?: { error?: { message?: string } };
		};
		if (err.statusCode === 410) {
			console.log(`Purchase expired a very long time ago, ignoring`);
			return [];
		}
		if (
			err.statusCode === 400 &&
			err?.result?.error?.message === 'Invalid Value'
		) {
			console.warn(
				"The purchase token value was invalid, we can't recover from this error",
				err,
			);
			throw new ProcessingError('Invalid token value', false);
		} else {
			throw err;
		}
	}

	const billingPeriod =
		PRODUCT_BILLING_PERIOD[subscriptionReference.subscriptionId];
	if (billingPeriod === undefined) {
		console.warn(
			`[593d026a] Unable to get the billing period, unknown google subscription ID ${subscriptionReference.subscriptionId}`,
		);
	}

	const subscription = await googleResponseBodyToSubscription(
		subscriptionReference.purchaseToken,
		subscriptionReference.packageName,
		subscriptionReference.subscriptionId,
		billingPeriod,
		shouldBuildExtra,
		response,
	);
	return [subscription];
}

// -----------------------------------------------------------------------------
// Handler

export async function handler(event: SQSEvent) {
	const promises = event.Records.map((record) => {
		console.log(`[447bd6ea] event: ${JSON.stringify(record)}`);
		return parseAndStoreSubscriptionUpdate(record, (record) =>
			getGoogleSubResponse(record, true),
		);
	});

	return Promise.all(promises).then((_) => 'OK');
}
