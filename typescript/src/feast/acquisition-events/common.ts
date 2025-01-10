import { restClient } from '../../utils/restClient';
import { getConfigValue } from '../../utils/ssmConfig';
import { Stage } from '../../utils/appIdentity';

// This function is duplicated from the copy in src/update-subs/google.ts
// This will be corrected in the future refactoring

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
	amount?: number;
	country: string;
	currency: string;
	componentId?: string;
	componentType?: string;
	campaignCode?: string;
	source?: string;
	referrerUrl?: string;
	abTests: void[]; // this will have to be updated later if we want to use it

	paymentFrequency: string; // TODO: make it a set of values
	// "ONE_OFF"
	// "MONTHLY"
	// "QUARTERLY"
	// "SIX_MONTHLY"
	// "ANNUALLY"

	paymentProvider?: void; // this will have to be updated later if we want to use it
	printOptions?: void; // this will have to be updated later if we want to use it
	browserId?: string;
	identityId?: string;
	pageViewId?: string;
	referrerPageViewId?: string;
	labels: void[];
	promoCode?: string;
	reusedExistingPaymentMethod: boolean;
	readerType: string;
	acquisitionType: string;
	zuoraSubscriptionNumber?: string;
	contributionId?: string;
	paymentId: string; // optional in the acquisition API model, but required by Data Design, see comment id: e3f790af
	queryParameters: AcquisitionApiPayloadQueryParameter[];
	platform?: string;
	postalCode?: string;
	state?: string;
	email?: string;
};

export const postPayloadToAcquisitionAPI = async (
	payload: AcquisitionApiPayload,
) => {
	// Date: 12 Dec 2024
	// We are only performing that operation on PROD, because we do not have a code endpoint
	// the parameter `acquisitionApiUrl` has only been defined for stage PROD in Paremeter Store
	if (Stage === 'PROD') {
		const url = await getConfigValue<string>('acquisitionApiUrl');
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
