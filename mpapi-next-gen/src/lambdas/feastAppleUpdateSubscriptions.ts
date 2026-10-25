import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { App } from '../common/app';
import { GracefulProcessingError } from '../common/GracefulProcessingError';
import { Subscription } from '../common/subscription';
import type { AppleSubscriptionReference } from '../common/subscriptionReference';
import { UserSubscription } from '../common/userSubscription';
import { validateReceipt } from '../common/appleValidateReceipts';
import { getIdentityIdFromBraze, IdentityIdFromBraze } from '../common/braze';
import { Region, Stage } from '../common/appIdentity';
import {
	CloudWatchClient,
	PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import {
	SQSClient,
	SendMessageCommand,
	SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { PRODUCT_BILLING_PERIOD } from '../common/productBillingPeriod';
import type { AppleStoreKitSubscriptionDataDerivationForExtra } from '../common/api-storekit';
import { transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra } from '../common/api-storekit';
import type { AppleValidationResponse } from '../common/appleValidateReceipts';
import { appleBundleToPlatform } from '../common/appToPlatform';
import { dateToSecondTimestamp, thirtyMonths } from '../common/dates';
import { userSubscriptionsFullTableName } from '../common/userSubscription';
import { subscriptionsFullTableName } from '../common/subscription';

// -----------------------------------------------------------------------------
// Types

export type SubscriptionMaybeWithAppAccountToken = Subscription & {
	appAccountToken?: string;
};

type FetchSubsFromApple = (
	reference: AppleSubscriptionReference,
) => Promise<SubscriptionMaybeWithAppAccountToken[]>;
type StoreSubInDynamo = (subscription: Subscription) => Promise<void>;
type SendSubToHistoricalQueue = (subscription: Subscription) => Promise<void>;
type ExchangeExternalIdForIdentityId = (
	externalId: string,
) => Promise<IdentityIdFromBraze>;
type StoreUserSubInDynamo = (
	userSubscription: UserSubscription,
) => Promise<void>;

// -----------------------------------------------------------------------------
// Globals

const cloudWatchClient = new CloudWatchClient({ region: Region });
const sqsClient = new SQSClient({ region: Region });
const dynamoDbClient = new DynamoDBClient({ region: Region });

// -----------------------------------------------------------------------------
// Functions

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

	// Defining the two variables we need to call for the extra data
	const transactionId: string =
		response.latestReceiptInfo.originalTransactionId;
	const appBundleId: string | undefined = response.latestReceiptInfo.bundleId;
	if (appBundleId !== undefined) {
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

async function putMetric(metricName: string, value = 1.0): Promise<void> {
	await cloudWatchClient.send(
		new PutMetricDataCommand({
			Namespace: 'soft-opt-ins',
			MetricData: [
				{
					MetricName: metricName,
					Unit: 'Count',
					Value: value,
					Dimensions: [
						{
							Name: 'Stage',
							Value: Stage,
						},
					],
				},
			],
		}),
	);
}

const defaultStoreUserSubscriptionInDynamo = async (
	userSubscription: UserSubscription,
): Promise<void> => {
	const tableName = userSubscriptionsFullTableName();

	const plainUserSubscription = {
		userId: userSubscription.userId,
		subscriptionId: userSubscription.subscriptionId,
		creationTimestamp: userSubscription.creationTimestamp,
	};

	await dynamoDbClient.send(
		new PutItemCommand({
			TableName: tableName,
			Item: marshall(plainUserSubscription, { removeUndefinedValues: true }),
		}),
	);
};

async function defaultSendSubscriptionToHistoricalQueue(
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

const withAppAccountToken = (
	subscription: Subscription,
	appAccountToken: string,
): SubscriptionMaybeWithAppAccountToken =>
	Object.assign(subscription, { appAccountToken: appAccountToken });

const decodeSubscriptionReference = (
	record: SQSRecord,
): AppleSubscriptionReference => {
	return JSON.parse(record.body) as AppleSubscriptionReference;
};

const defaultFetchSubscriptionsFromApple = async (
	reference: AppleSubscriptionReference,
): Promise<SubscriptionMaybeWithAppAccountToken[]> => {
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), 10000);

	const timeoutPromise = new Promise<never>((_, reject) => {
		controller.signal.addEventListener('abort', () => {
			reject(new Error('Apple receipt validation timed out after 10 seconds'));
		});
	});

	try {
		const responses = await Promise.race([
			validateReceipt(reference.receipt, { sandboxRetry: false }, App.Feast),
			timeoutPromise,
		]);

		clearTimeout(timeoutId);

		return Promise.all(
			responses.map(async (response) => {
				const subscription = await toAppleSubscription_async(response);
				if (response.latestReceiptInfo.appAccountToken) {
					return withAppAccountToken(
						subscription,
						response.latestReceiptInfo.appAccountToken,
					);
				} else {
					return subscription;
				}
			}),
		);
	} catch (error: any) {
		clearTimeout(timeoutId);
		throw error;
	}
};

const defaultStoreSubscriptionInDynamo = async (
	subscription: Subscription,
): Promise<void> => {
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
			Item: marshall(plainSubscription, { removeUndefinedValues: true }),
		}),
	);
};

const processRecord = async (
	fetchSubscriptionsFromApple: FetchSubsFromApple,
	storeSubscriptionInDynamo: StoreSubInDynamo,
	sendSubscriptionToHistoricalQueue: SendSubToHistoricalQueue,
	exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId,
	storeUserSubscriptionInDynamo: StoreUserSubInDynamo,
	record: SQSRecord,
) => {
	const reference = decodeSubscriptionReference(record);

	const subscriptions = await fetchSubscriptionsFromApple(reference);

	await Promise.all(subscriptions.map(storeSubscriptionInDynamo));
	await Promise.all(subscriptions.map(sendSubscriptionToHistoricalQueue));

	await Promise.all(
		subscriptions.map(async (s) => {
			if (s.appAccountToken) {
				const { identityId } = await exchangeExternalIdForIdentityId(
					s.appAccountToken,
				);
				if (identityId) {
					const now = new Date().toISOString();
					const linked = new UserSubscription(
						identityId,
						s.subscriptionId,
						now,
					);
					await storeUserSubscriptionInDynamo(linked);
				} else {
					await putMetric('feast_apple_update_subs_missing_identity_id', 1);
				}
			} else {
				console.log(
					`Subscription with receipt '${s.receipt}' did not have an 'appAccountToken'`,
				);
			}
		}),
	);
};

const processRecordWithErrorHandling = async (
	fetchSubscriptionsFromApple: FetchSubsFromApple,
	storeSubscriptionInDynamo: StoreSubInDynamo,
	sendSubscriptionToHistoricalQueue: SendSubToHistoricalQueue,
	exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId,
	storeUserSubscriptionInDynamo: StoreUserSubInDynamo,
	record: SQSRecord,
) => {
	try {
		return await processRecord(
			fetchSubscriptionsFromApple,
			storeSubscriptionInDynamo,
			sendSubscriptionToHistoricalQueue,
			exchangeExternalIdForIdentityId,
			storeUserSubscriptionInDynamo,
			record,
		);
	} catch (error) {
		if (error instanceof GracefulProcessingError) {
			console.warn(
				'Error processing the subscription update is being handled gracefully',
				error,
			);
			return;
		} else {
			console.error('Unexpected error, will throw to retry: ', error);
			throw error;
		}
	}
};

export function buildHandler(
	fetchSubscriptionsFromApple: FetchSubsFromApple = defaultFetchSubscriptionsFromApple,
	storeSubscriptionInDynamo: StoreSubInDynamo = defaultStoreSubscriptionInDynamo,
	sendSubscriptionToHistoricalQueue: SendSubToHistoricalQueue = defaultSendSubscriptionToHistoricalQueue,
	exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId = getIdentityIdFromBraze,
	storeUserSubscriptionInDynamo: StoreUserSubInDynamo = defaultStoreUserSubscriptionInDynamo,
): (event: SQSEvent) => Promise<string> {
	return (event: SQSEvent) => {
		const promises = event.Records.map((record) => {
			return processRecordWithErrorHandling(
				fetchSubscriptionsFromApple,
				storeSubscriptionInDynamo,
				sendSubscriptionToHistoricalQueue,
				exchangeExternalIdForIdentityId,
				storeUserSubscriptionInDynamo,
				record,
			);
		});

		return Promise.all(promises)
			.then((promises) => {
				console.log(`Successfully processed ${promises.length} record(s)`);
				return promises;
			})
			.then((_) => 'OK');
	};
}

// -----------------------------------------------------------------------------
// Handler

export const handler = buildHandler();
