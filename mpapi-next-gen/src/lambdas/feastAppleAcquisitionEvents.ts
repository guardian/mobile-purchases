import 'source-map-support/register';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { App } from '../common/app';
import { Subscription } from '../common/subscription';
import type {
	AppleStoreKitSubscriptionDataDerivationForExtra,
	AppleStoreKitSubscriptionDataDerivationForFeastPipeline,
} from '../common/api-storekit';
import {
	appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline,
	transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra,
} from '../common/api-storekit';
import type {
	AppleValidationResponse,
	ValidationOptions,
} from '../common/appleValidateReceipts';
import { validateReceipt } from '../common/appleValidateReceipts';
import { getParameterValueUsingAppStageStackConvention } from '../common/ssmParameters';
import { Stage } from '../common/appIdentity';
import { restClient } from '../common/restClient';
import { PRODUCT_BILLING_PERIOD } from '../common/productBillingPeriod';
import { appleBundleToPlatform } from '../common/appToPlatform';
import { dateToSecondTimestamp, thirtyMonths } from '../common/dates';

export type AcquisitionApiPayloadQueryParameter = {
	name: string;
	value: string;
};

// This schema simply follows the one given here:
// direct link: https://github.com/guardian/support-frontend/blob/main/support-modules/acquisition-events/src/main/scala/com/gu/support/acquisitions/models/AcquisitionDataRow.scala
// permalink  : https://github.com/guardian/support-frontend/blob/4d8c76a16bddd01ab91e59f89adbcf0867923c69/support-modules/acquisition-events/src/main/scala/com/gu/support/acquisitions/models/AcquisitionDataRow.scala

export type AcquisitionApiPayload = {
	eventTimeStamp: string;
	product: string;
	amount?: number | undefined;
	country: string;
	currency: string;
	componentId?: string | undefined;
	componentType?: string | undefined;
	campaignCode?: string | undefined;
	source?: string | undefined;
	referrerUrl?: string | undefined;
	abTests: void[]; // this will have to be updated later if we want to use it

	paymentFrequency: string; // TODO: make it a set of values
	// "ONE_OFF"
	// "MONTHLY"
	// "QUARTERLY"
	// "SIX_MONTHLY"
	// "ANNUALLY"

	paymentProvider?: void | undefined; // this will have to be updated later if we want to use it
	printOptions?: void | undefined; // this will have to be updated later if we want to use it
	browserId?: string | undefined;
	identityId?: string | undefined;
	pageViewId?: string | undefined;
	referrerPageViewId?: string | undefined;
	labels: void[];
	promoCode?: string | undefined;
	reusedExistingPaymentMethod: boolean;
	readerType: string;
	acquisitionType: string;
	zuoraSubscriptionNumber?: string | undefined;
	contributionId?: string | undefined;
	paymentId: string; // optional in the acquisition API model, but required by Data Design, see comment id: e3f790af
	queryParameters: AcquisitionApiPayloadQueryParameter[];
	platform?: string | undefined;
	postalCode?: string | undefined;
	state?: string | undefined;
	email?: string | undefined;
};

export const postPayloadToAcquisitionAPI = async (
	payload: AcquisitionApiPayload,
) => {
	// Date: 12 Dec 2024
	// We are only performing that operation on PROD, because we do not have a code endpoint
	// the parameter `acquisitionApiUrl` has only been defined for stage PROD in Paremeter Store
	if (Stage === 'PROD') {
		const url =
			await getParameterValueUsingAppStageStackConvention<string>(
				'acquisitionApiUrl',
			);
		console.log(`[9118860a] acquisition api url: ${url}`);
		const additionalHeaders = { 'Content-Type': 'application/json' };
		const body = JSON.stringify(payload);
		await restClient.client.post(url, body, additionalHeaders);
	} else {
		console.log(
			`[69460012] postPayload has been called with payload: ${JSON.stringify(payload)}`,
		);
	}
};

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
			AppleStoreKitSubscriptionDataDerivationForExtra | undefined =
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

const appleSubscriptionToAcquisitionApiPayload = async (
	subscription: Subscription,
): Promise<AcquisitionApiPayload> => {
	const extendedData:
		AppleStoreKitSubscriptionDataDerivationForFeastPipeline | undefined =
		await appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline(
			subscription,
		);

	if (extendedData === undefined) {
		console.error(
			`[e88e8329] there was a problem while acquiring subscription data from Apple`,
		);
		throw new Error(
			'[ae7b14ba] there was a problem while acquiring subscription data from Apple',
		);
	}

	console.log(
		`[12901310] acquisition api payload: ${JSON.stringify(extendedData)}`,
	);

	const eventTimeStamp = subscription.startTimestamp;
	const product = 'FEAST_APP';
	const amount = undefined; // Tom said to leave it undefined
	const country = extendedData.country;
	const currency = extendedData.currency;
	const componentId = undefined;
	const componentType = undefined;
	const campaignCode = undefined;
	const source = undefined;
	const referrerUrl = undefined;
	const abTests: void[] = [];
	const paymentFrequency = extendedData.paymentFrequency;
	const paymentProvider = undefined;
	const printOptions = undefined;
	const browserId = undefined;
	const identityId = undefined;
	const pageViewId = undefined;
	const referrerPageViewId = undefined;
	const labels: void[] = [];
	const promoCode = undefined;
	const reusedExistingPaymentMethod = false;
	const readerType = 'Direct';
	const acquisitionType = 'PURCHASE';
	const zuoraSubscriptionNumber = undefined;
	const contributionId = undefined;

	// See comment id: e3f790af
	const paymentId = subscription.subscriptionId;

	const queryParameters: AcquisitionApiPayloadQueryParameter[] = [];
	const platform = undefined;
	const postalCode = undefined;
	const state = undefined;
	const email = undefined;

	const payload: AcquisitionApiPayload = {
		eventTimeStamp,
		product,
		amount,
		country,
		currency,
		componentId,
		componentType,
		campaignCode,
		source,
		referrerUrl,
		abTests,
		paymentFrequency,
		paymentProvider,
		printOptions,
		browserId,
		identityId,
		pageViewId,
		referrerPageViewId,
		labels,
		promoCode,
		reusedExistingPaymentMethod,
		readerType,
		acquisitionType,
		zuoraSubscriptionNumber,
		contributionId,
		paymentId,
		queryParameters,
		platform,
		postalCode,
		state,
		email,
	};
	return payload;
};

const processSQSRecord = async (record: SQSRecord): Promise<void> => {
	const subscription = JSON.parse(record.body);
	const receipt = subscription['receipt'];
	console.log(`[8a50f97d] receipt: ${receipt}`);
	if (receipt === undefined) {
		console.log(`[4ddde2a0] receipt is undefined`);
		return;
	}
	const validationOptions: ValidationOptions = {
		sandboxRetry: true,
	};
	const appleValidationResponses: AppleValidationResponse[] =
		await validateReceipt(receipt, validationOptions, App.Feast);
	console.log(
		`[2dc25207] AppleValidationResponses: ${JSON.stringify(appleValidationResponses)}`,
	);
	const promises = appleValidationResponses.map(
		async (appleValidationResponse) => {
			const appleSubscription: Subscription = await toAppleSubscription_async(
				appleValidationResponse,
			);
			console.log(
				`[a41a0078] appleSubscription: ${JSON.stringify(appleSubscription)}`,
			);
			const payload =
				await appleSubscriptionToAcquisitionApiPayload(appleSubscription);
			console.log(
				`[ffdce775] acquisition api payload: ${JSON.stringify(payload)}`,
			);
			await postPayloadToAcquisitionAPI(payload);
		},
	);
	await Promise.all(promises);
};

export const handler = async (event: SQSEvent): Promise<void> => {
	console.log(
		'[0a06c521] Feast Apple Acquisition Events Lambda has been called',
	);
	console.log(`[d9a1beb1] Processing ${event.Records.length} records`);
	const promises = event.Records.map(async (record: SQSRecord) => {
		await processSQSRecord(record);
	});
	await Promise.all(promises);
	console.log('[2ebc3ffa] Finished processing records');
};
