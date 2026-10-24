import type { SQSEvent, SQSRecord } from 'aws-lambda';
import {
	Subscription,
	subscriptionsFullTableName,
} from '../common/subscription';
import type { AppleSubscriptionReference } from '../common/subscriptionReference';
import type { AppleStoreKitSubscriptionDataDerivationForExtra } from '../common/api-storekit';
import { transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra } from '../common/api-storekit';
import type { AppleValidationResponse } from '../common/appleValidateReceipts';
import { validateReceipt } from '../common/appleValidateReceipts';
import { appleBundleToPlatform } from '../common/appToPlatform';
import { PRODUCT_BILLING_PERIOD } from '../common/productBillingPeriod';
import { dateToSecondTimestamp, thirtyMonths } from '../common/dates';
import { GracefulProcessingError } from '../common/GracefulProcessingError';
import { ProcessingError } from '../common/processingError';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

// -----------------------------------------------------------------------------
// Globals

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

// -----------------------------------------------------------------------------
// Functions

export async function putSubscription(
	subscription: Subscription,
): Promise<Subscription> {
	// re-mapping the fields explicitly to guarantee a plain object literal
	const persistenceObject = {
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
	const command = new PutItemCommand({
		TableName: subscriptionsFullTableName(),
		Item: marshall(persistenceObject, { removeUndefinedValues: true }),
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

export async function toAppleSubscription_async(
	response: AppleValidationResponse,
): Promise<Subscription> {
	const latestReceiptInfo = response.latestReceiptInfo;

	let autoRenewStatus = false;
	if (response.latestReceiptInfo.autoRenewStatus) {
		autoRenewStatus = true;
	}

	let cancellationDate: string | undefined;
	if (latestReceiptInfo.cancellationDate) {
		cancellationDate = latestReceiptInfo.cancellationDate.toISOString();
	}

	const billingPeriod = PRODUCT_BILLING_PERIOD[latestReceiptInfo.productId];
	if (billingPeriod === undefined) {
		console.warn(
			`[b017bb0f] Unable to get the billing period, unknown product ID ${latestReceiptInfo.productId}`,
		);
	}

	let extra = '';

	const transactionId: string =
		response.latestReceiptInfo.originalTransactionId;
	const appBundleId: string | undefined = response.latestReceiptInfo.bundleId;

	// preserving legacy behavior: gate the call strictly if appBundleId is present
	if (appBundleId) {
		const extra_object:
			| AppleStoreKitSubscriptionDataDerivationForExtra
			| undefined =
			await transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra(
				appBundleId,
				transactionId,
			);
		if (extra_object) {
			extra = JSON.stringify(extra_object);
		} else {
			console.log(
				`[a6a1af71] could not retrieve data from AppleStoreKit; appBundleId: ${appBundleId}, transactionId: ${transactionId}`,
			);
		}
	}

	const subscription = new Subscription(
		latestReceiptInfo.originalTransactionId, // subscriptionId
		latestReceiptInfo.originalPurchaseDate.toISOString(), // startTimestamp
		latestReceiptInfo.expiresDate.toISOString(), // endTimestamp
		cancellationDate, // cancellationTimestamp
		autoRenewStatus, // autoRenewing
		latestReceiptInfo.productId, // productId
		appleBundleToPlatform(response.latestReceiptInfo.bundleId)?.toString(), // platform
		latestReceiptInfo.trialPeriod || latestReceiptInfo.inIntroOfferPeriod, // freeTrial
		billingPeriod, // billingPeriod
		null, // googlePayload
		response.latestReceipt, // receipt
		response.originalResponse, // applePayload
		dateToSecondTimestamp(thirtyMonths(latestReceiptInfo.expiresDate)), // ttl
		extra, // extra
	);

	return Promise.resolve(subscription);
}

function sqsRecordToAppleSubscription(
	record: SQSRecord,
): Promise<Subscription[]> {
	const subRef = JSON.parse(record.body) as AppleSubscriptionReference;

	// sandboxRetry is set to false such that in production we don't store any sandbox receipt that would have snuck all the way here
	// In CODE or locally the default endpoint will be sanbox therefore no retry is necessary
	return validateReceipt(subRef.receipt, { sandboxRetry: false }).then(
		async (subs) => Promise.all(subs.map(toAppleSubscription_async)),
	); // `subs` here is a AppleValidationResponse[]
}

// -----------------------------------------------------------------------------
// Handler

export async function handler(event: SQSEvent): Promise<string> {
	const promises = event.Records.map((record) =>
		parseAndStoreSubscriptionUpdate(record, sqsRecordToAppleSubscription),
	);
	return Promise.all(promises).then((_) => 'OK');
}
