import type { SQSRecord } from 'aws-lambda';
import { ProcessingError } from './processingError';
import { Subscription } from './subscription';
import type { GoogleSubscriptionReference } from './subscriptionReference';
import { googlePackageNameToPlatform } from './appToPlatform';
import type { GoogleResponseBody } from './google-play';
import { fetchGoogleSubscription, GOOGLE_PAYMENT_STATE } from './google-play';
import type { GoogleExtraDataExtended } from './google-subscription-extra';
import { extraction } from './google-subscription-extra';
import { PRODUCT_BILLING_PERIOD } from './productBillingPeriod';
import { Stage } from './appIdentity';
import { dateToSecondTimestamp, optionalMsToDate, thirtyMonths } from './dates';

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
