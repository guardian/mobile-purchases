import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { GracefulProcessingError } from '../common/GracefulProcessingError';
import { ProcessingError } from '../common/processingError';
import { Subscription } from '../common/subscription';
import type { GoogleSubscriptionReference } from '../common/subscriptionReference';
import {
	UserSubscription,
	userSubscriptionsFullTableName,
} from '../common/userSubscription';
import { googlePackageNameToPlatform } from '../common/appToPlatform';
import type { IdentityIdFromBraze } from '../common/braze';
import { getIdentityIdFromBraze } from '../common/braze';
import type { GoogleResponseBody } from '../common/google-play';
import { fetchGoogleSubscription } from '../common/google-play';
import { fetchGoogleSubscriptionV2 } from '../common/google-play-v2';
import type { GoogleSubscription } from '../common/google-play-v2';
import { googleResponseBodyToSubscription } from '../common/update-subs-google-function';
import { putSubscription } from '../common/updatesub';
import { dateToSecondTimestamp, thirtyMonths } from '../common/dates';
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

// -----------------------------------------------------------------------------
// Globals

const cloudWatchClient = new CloudWatchClient({ region: Region });
const sqsClient = new SQSClient({ region: Region });
const dynamoDbClient = new DynamoDBClient({ region: Region });

// -----------------------------------------------------------------------------
// Functions

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

export const storeUserSubscriptionInDynamo = async (
	userSubscription: UserSubscription,
): Promise<void> => {
	const tableName = userSubscriptionsFullTableName();

	// fun way to convert the class instance into a plain data object
	// containing all fields
	const plainUserSubscription = { ...userSubscription };

	await dynamoDbClient.send(
		new PutItemCommand({
			TableName: tableName,
			Item: marshall(plainUserSubscription, { removeUndefinedValues: true }),
		}),
	);
};

async function queueHistoricalSubscription(
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

const googleSubscriptionToSubscription = (
	purchaseToken: string,
	packageName: string,
	googleSubscription: GoogleSubscription,
): Subscription => {
	return new Subscription(
		purchaseToken,
		googleSubscription.startTime?.toISOString() ?? '',
		googleSubscription.expiryTime.toISOString(),
		googleSubscription.userCancellationTime?.toISOString(),
		googleSubscription.autoRenewing,
		googleSubscription.productId,
		googlePackageNameToPlatform(packageName),
		googleSubscription.freeTrial,
		googleSubscription.billingPeriodDuration,
		googleSubscription,
		undefined,
		null,
		dateToSecondTimestamp(thirtyMonths(googleSubscription.expiryTime)),
	);
};

export const buildHandler =
	(
		fetchSubscriptionDetails: (
			purchaseToken: string,
			packageName: string,
		) => Promise<GoogleSubscription>,
		fetchSubscriptionDetailsV1: (
			subscriptionId: string,
			purchaseToken: string,
			packageName: string,
		) => Promise<GoogleResponseBody | null>,
		putSubscription: (subscription: Subscription) => Promise<Subscription>,
		sendSubscriptionToHistoricalQueue: (
			subscription: Subscription,
		) => Promise<void>,
		exchangeExternalIdForIdentityId: (
			externalId: string,
		) => Promise<IdentityIdFromBraze>,
		storeUserSubInDynamo: (userSub: UserSubscription) => Promise<void>,
		shouldBuildExtra: boolean = false,
	) =>
	async (event: SQSEvent) => {
		const promises = event.Records.map(async (sqsRecord: SQSRecord) => {
			try {
				// TODO: parse this using zod to get validation
				const subRef = JSON.parse(
					sqsRecord.body,
				) as GoogleSubscriptionReference;
				const subscriptionFromGoogle = await fetchSubscriptionDetails(
					subRef.purchaseToken,
					subRef.packageName,
				);
				const subscription = googleSubscriptionToSubscription(
					subRef.purchaseToken,
					subRef.packageName,
					subscriptionFromGoogle,
				);
				await putSubscription(subscription);

				// We need a subscription in the format from the "V1" endpoint from Google to fit the historical table
				const googleResponseV1 = await fetchSubscriptionDetailsV1(
					subRef.subscriptionId,
					subRef.purchaseToken,
					subRef.packageName,
				);
				const subscriptionV1 = await googleResponseBodyToSubscription(
					subRef.purchaseToken,
					subRef.packageName,
					subRef.subscriptionId,
					subscriptionFromGoogle.billingPeriodDuration,
					shouldBuildExtra,
					googleResponseV1,
				);
				await sendSubscriptionToHistoricalQueue(subscriptionV1);

				if (subscriptionFromGoogle.obfuscatedExternalAccountId) {
					const { identityId } = await exchangeExternalIdForIdentityId(
						subscriptionFromGoogle.obfuscatedExternalAccountId,
					);
					if (identityId) {
						console.log('Successfully exchanged UUID for identity ID');

						const userSubscription = new UserSubscription(
							identityId,
							subscription.subscriptionId,
							new Date().toISOString(),
						);
						await storeUserSubInDynamo(userSubscription);

						console.log(
							`Processed subscription: ${subscription.subscriptionId}`,
						);
					} else {
						await putMetric('feast_google_update_subs_missing_identity_id', 1);
					}
				} else {
					console.log(
						`Subscription ${subscription.subscriptionId} does not contain an external account ID`,
					);
				}

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
		});

		return Promise.all(promises).then((_) => 'OK');
	};

// -----------------------------------------------------------------------------
// Handler

export const handler = buildHandler(
	fetchGoogleSubscriptionV2,
	fetchGoogleSubscription,
	putSubscription,
	queueHistoricalSubscription,
	getIdentityIdFromBraze,
	storeUserSubscriptionInDynamo,
	true,
);
