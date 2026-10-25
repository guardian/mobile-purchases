import 'source-map-support/register';
import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { Subscription } from '../common/subscription';
import { googlePackageNameToPlatform } from '../common/appToPlatform';
import type { GoogleSubscription } from '../common/google-play-v2';
import { fetchGoogleSubscriptionV2 } from '../common/google-play-v2';
import { dateToSecondTimestamp, thirtyMonths } from '../common/dates';
import { Stage } from '../common/appIdentity';
import { getParameterValueUsingAppStageStackConvention } from '../common/ssmParameters';

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
	if (Stage === 'PROD') {
		const url =
			await getParameterValueUsingAppStageStackConvention<string>(
				'acquisitionApiUrl',
			);
		console.log(`[9118860a] acquisition api url: ${url}`);

		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000);

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload),
				signal: controller.signal,
			});

			if (!response.ok) {
				throw new Error(
					`[606a2012] Failed to post payload to Acquisition API: ${response.status} ${response.statusText}`,
				);
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				console.error(
					'[c4ef182a] Acquisition API request timed out after 10 seconds.',
				);
			}
			throw error;
		} finally {
			clearTimeout(timeoutId);
		}
	} else {
		console.log(
			`[69460012] postPayload has been called with payload: ${JSON.stringify(payload)}`,
		);
	}
};

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

const countryToCurrencyMap = {
	GB: 'GBP', // United Kingdom - Pound Sterling

	// Rest of Europe
	AL: 'ALL', // Albania
	AD: 'EUR', // Andorra
	AT: 'EUR', // Austria
	BY: 'BYN', // Belarus
	BE: 'EUR', // Belgium
	BA: 'BAM', // Bosnia & Herzegovina
	BG: 'BGN', // Bulgaria
	HR: 'EUR', // Croatia
	CY: 'EUR', // Cyprus
	CZ: 'CZK', // Czech Republic
	DK: 'DKK', // Denmark
	EE: 'EUR', // Estonia
	FI: 'EUR', // Finland
	FR: 'EUR', // France
	DE: 'EUR', // Germany
	GR: 'EUR', // Greece
	HU: 'HUF', // Hungary
	IS: 'ISK', // Iceland
	IE: 'EUR', // Ireland
	IT: 'EUR', // Italy
	XK: 'EUR', // Kosovo
	LV: 'EUR', // Latvia
	LI: 'CHF', // Liechtenstein
	LT: 'EUR', // Lithuania
	LU: 'EUR', // Luxembourg
	MT: 'EUR', // Malta
	MD: 'MDL', // Moldova
	MC: 'EUR', // Monaco
	ME: 'EUR', // Montenegro
	NL: 'EUR', // Netherlands
	MK: 'MKD', // North Macedonia
	NO: 'NOK', // Norway
	PL: 'PLN', // Poland
	PT: 'EUR', // Portugal
	RO: 'RON', // Romania
	SM: 'EUR', // San Marino
	RS: 'RSD', // Serbia
	SK: 'EUR', // Slovakia
	SI: 'EUR', // Slovenia
	ES: 'EUR', // Spain
	SE: 'SEK', // Sweden
	CH: 'CHF', // Switzerland
	TR: 'TRY', // Turkey
	UA: 'UAH', // Ukraine
	VA: 'EUR', // Vatican City

	// More Europe
	AM: 'AMD', // Armenia - Armenian Dram
	AZ: 'AZN', // Azerbaijan - Azerbaijani Manat
	GE: 'GEL', // Georgia - Georgian Lari
	KZ: 'KZT', // Kazakhstan - Kazakhstani Tenge

	// Rest of the world (big economies)
	US: 'USD', // United States - Dollar
	JP: 'JPY', // Japan - Yen
	CN: 'CNY', // China - Yuan Renminbi
	IN: 'INR', // India - Indian Rupee
	CA: 'CAD', // Canada - Canadian Dollar
	AU: 'AUD', // Australia - Australian Dollar
	NZ: 'NZD', // New Zealand - New Zealand Dollar
	BR: 'BRL', // Brazil - Brazilian Real

	// Asia
	BD: 'BDT', // Bangladesh - Bangladeshi Taka
	PK: 'PKR', // Pakistan - Pakistani Rupee
	SG: 'SGD', // Singapore - Singapore Dollar
	KR: 'KRW', // South Korea - South Korean Won
	MY: 'MYR', // Malaysia - Malaysian Ringgit
	TH: 'THB', // Thailand - Thai Baht
	VN: 'VND', // Vietnam - Vietnamese Dong
	LK: 'LKR', // Sri Lanka - Sri Lankan Rupee
	AE: 'AED', // United Arab Emirates - Dirham
	PH: 'PHP', // Philippines - Philippine Peso
	ID: 'IDR', // Indonesia - Rupiah
	HK: 'HKD', // Hong Kong - Hong Kong Dollar,

	// Africa
	ZA: 'ZAR', // South Africa - South African Rand
	NG: 'NGN', // Nigeria - Nigerian Naira
	EG: 'EGP', // Egypt - Egyptian Pound
	KE: 'KES', // Kenya - Kenyan Shilling
	ET: 'ETB', // Ethiopia - Ethiopian Birr
	ZW: 'ZWL', // Zimbabwe, Zimbabwe Dollar ( https://en.wikipedia.org/wiki/Zimbabwean_dollar )
	// Although The Zimbabwe Gold (ZiG; code: ZWG) ( https://en.wikipedia.org/wiki/Zimbabwean_ZiG )
	// is the official currency of Zimbabwe since 8 April 2024,
	// the bigquery-acquisitions-publisher, expect the old currency Zimbabwe Dollar
	// https://github.com/guardian/support-frontend/blob/7bb6458a3cda69b70f8d3e46ac6b95814891216d/support-lambdas/bigquery-acquisitions-publisher/typescript/currencySchema.ts#L163
	CD: 'CDF', // Democratic Republic of the Congo - Congolese franc
	UG: 'UGX', // Republic of Uganda - Ugandan shilling

	// Americas
	MX: 'MXN', // Mexico - Mexican Peso
	AR: 'ARS', // Argentina - Argentine Peso
	CL: 'CLP', // Chile - Chilean Peso
	CO: 'COP', // Colombia - Colombian Peso
	PE: 'PEN', // Peru - Peruvian Sol
	TT: 'TTD', // Trinidad & Tobago - Trinidad & Tobago Dollar
	VI: 'USD', // United States Virgin Islands - United States Dollar

	// Oceania
	FJ: 'FJD', // Fiji - Fijian Dollar
	PG: 'PGK', // Papua New Guinea - Papua New Guinean Kina

	// Other
	SA: 'SAR', // Saudi Arabia - Saudi Riyal
	RU: 'RUB', // Russia - Russian Ruble
	BZ: 'BZD', // Belize - Belize Dollar
	IL: 'ILS', // Israel - Israeli Shekel
	KG: 'KGS', // Kyrgyzstan - Kyrgystani Som
	MU: 'MUR', // Republic of Mauritius - Mauritian rupee
	NP: 'NPR', // Nepal - Nepalese Rupee
	BH: 'BHD', // Bahrain - Bahraini Dinar
	MV: 'MVR', // the Maldives - Maldivian rufiyaa
	GH: 'GHS', // Ghana - Ghanaian Cedi
	JM: 'JMD', // Jamaica - Jamaican dollar
	PR: 'USD', // Puerto Rico - United States Dollar
	BO: 'BOB', // Bolivia - Bolivian boliviano
	KW: 'KWD', // Kuwait - Kuwaiti dinar (KWD)
	CR: 'CRC', // Costa Rica - Costa Rican Colones (CRC)
	GT: 'GTQ', // Guatemala - Quetzal (GTQ)
	EC: 'USD', // Ecuador - United States dollar (USD)
	GI: 'GIP', // Gibraltar - Gibraltar Pound
	OM: 'OMR', // Oman - Omani Rial
};

const countryToCurrency = (country: string): string => {
	const supportedCountries = Object.keys(countryToCurrencyMap);
	if (supportedCountries.includes(country)) {
		return countryToCurrencyMap[country as keyof typeof countryToCurrencyMap];
	}
	// Throwing an error here is not ideal, but it will do for the moment...
	throw new Error(
		`[acba643d] (countryToCurrencyMap) country ${country} is not supported`,
	);
};

const basePlanIdToPaymentFrequencyMap = {
	'feast-annual': 'ANNUALLY',
	'feast-monthly': 'MONTHLY',
};

const basePlanIdToPaymentFrequency = (basePlanId: string): string => {
	const supportedBasePlanIds = Object.keys(basePlanIdToPaymentFrequencyMap);
	if (supportedBasePlanIds.includes(basePlanId)) {
		return basePlanIdToPaymentFrequencyMap[
			basePlanId as keyof typeof basePlanIdToPaymentFrequencyMap
		];
	}
	// Throwing an error here is not ideal, but it will do for the moment...
	throw new Error(`[fd8665bb] basePlanId ${basePlanId} is not supported`);
};

const extractBasePlanId = (subscription: Subscription): string => {
	// The logic of this code is based on the idea that we can determine the Payment Frequency from the basePlanId
	// which can be found in the rawResponse of the Google Subscription object
	// -> rawResponse.lineItems[0].offerDetails.basePlanId: feast-annual or feast-monthly

	const lineItems = subscription.googlePayload?.rawResponse?.lineItems;

	if (lineItems === undefined) {
		throw new Error(`[bb575066] lineItems is undefined`);
	}

	if (lineItems.length === 0) {
		throw new Error(`[bb575066] lineItems is defined but is empty`);
	}
	const lineItem = lineItems[0];

	const basePlanId = lineItem.offerDetails?.basePlanId;

	if (basePlanId === undefined) {
		throw new Error(`[c1755b69] basePlanId is undefined`);
	}

	return basePlanId;
};

const googleSubscriptionToAcquisitionApiPayload = (
	subscription: Subscription,
): AcquisitionApiPayload => {
	const eventTimeStamp = subscription.startTimestamp;
	const product = 'FEAST_APP';
	const amount = undefined; // Tom said to leave it undefined
	const country = subscription.googlePayload?.rawResponse?.regionCode ?? 'GB';

	// We do not have access to the currency in the Google Subscription object
	// mapping of country to currency is not ideal but the best solution for now
	const currency = countryToCurrency(country);

	const componentId = undefined;
	const componentType = undefined;
	const campaignCode = undefined;
	const source = undefined;
	const referrerUrl = undefined;
	const abTests: void[] = [];

	const basePlanId = extractBasePlanId(subscription);
	const paymentFrequency = basePlanIdToPaymentFrequency(basePlanId);

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

	// Comment: { id: e3f790af, author: Pascal, date: 2024-12-12 }
	// He have a special request from Data Design to use the paymentId field to pass the subscriptionId
	// Don't ask...
	// And in particular, although the acquisition API model says that the paymentId is optional,
	// since it's expected to bet set by Data Design, we are declaring it to be medatory here.
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
	console.log(
		`[48bb04a0] calling processRecord (Google version) with record ${JSON.stringify(record)}`,
	);
	const subscriptionFromQueue: Subscription = JSON.parse(record.body);
	console.log(
		`[cf7fd559] subscriptionFromQueue: ${JSON.stringify(subscriptionFromQueue)}`,
	);
	// We are now collecting the the data required to query the Google Play API (v2) for subscription details
	const purchaseToken = subscriptionFromQueue.subscriptionId;
	const packageName = 'uk.co.guardian.feast';
	const subscriptionFromGoogle = await fetchGoogleSubscriptionV2(
		purchaseToken,
		packageName,
	);
	console.log(
		`[4fe9b14b] subscriptionFromGoogle: ${JSON.stringify(subscriptionFromGoogle)}`,
	);
	const subscriptionUpdated: Subscription = googleSubscriptionToSubscription(
		purchaseToken,
		packageName,
		subscriptionFromGoogle,
	);
	console.log(
		`[2ba4a5a7] subscriptionUpdated: ${JSON.stringify(subscriptionUpdated)}`,
	);
	const payload =
		googleSubscriptionToAcquisitionApiPayload(subscriptionUpdated);
	console.log(`[d522f940] acquisition api payload: ${JSON.stringify(payload)}`);
	await postPayloadToAcquisitionAPI(payload);
};

export const handler = async (event: SQSEvent): Promise<void> => {
	console.log(
		'[e01d21bb] Feast Google Acquisition Events Lambda has been called',
	);
	console.log(`[8b8b51a5] Processing ${event.Records.length} records`);
	const promises = event.Records.map(async (record: SQSRecord) => {
		await processSQSRecord(record);
	});
	await Promise.all(promises);
	console.log('[a2231ca1] Finished processing records');
};
