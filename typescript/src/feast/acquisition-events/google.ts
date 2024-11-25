import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { Subscription } from "../../models/subscription";
import { GoogleSubscription, fetchGoogleSubscriptionV2 } from "../../services/google-play-v2";
import { googlePackageNameToPlatform } from "../../services/appToPlatform";
import { dateToSecondTimestamp, thirtyMonths } from "../../utils/dates";
import { restClient } from "../../utils/restClient";

// This function is duplicated from the copy in src/update-subs/google.ts
// This will be corrected in the future refactoring

type AcquisitionApiPayloadQueryParameter = {
    name: string,
    value: string
}

// This schema simply follows the one given here: 
// direct link: https://github.com/guardian/support-frontend/blob/main/support-modules/acquisition-events/src/main/scala/com/gu/support/acquisitions/models/AcquisitionDataRow.scala
// permalink  : https://github.com/guardian/support-frontend/blob/4d8c76a16bddd01ab91e59f89adbcf0867923c69/support-modules/acquisition-events/src/main/scala/com/gu/support/acquisitions/models/AcquisitionDataRow.scala

type AcquisitionApiPayload = {
    eventTimeStamp: string,
    product: string,
    amount?: number,
    country: string,
    currency: string,
    componentId?: string,
    componentType?: string,
    campaignCode?: string,
    source?: string,
    referrerUrl?: string,
    abTests: [],
    paymentFrequency: string,
    paymentProvider?: string,
    printOptions?: string,
    browserId?: string,
    identityId?: string,
    pageViewId?: string,
    referrerPageViewId?: string,
    labels: [],
    promoCode?: string,
    reusedExistingPaymentMethod: boolean,
    readerType: string,
    acquisitionType: string,
    zuoraSubscriptionNumber?: string,
    contributionId?: string,
    paymentId?: string,
    queryParameters: AcquisitionApiPayloadQueryParameter[],
    platform?: string,
    postalCode?: string,
    state?: string,
    email?: string
}

const googleSubscriptionToSubscription = (
    purchaseToken: string,
    packageName: string,
    googleSubscription: GoogleSubscription
): Subscription => {
    return new Subscription(
        purchaseToken,
        googleSubscription.startTime?.toISOString() ?? "",
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
    )
};

const googleSubscriptionToAcquisitionApiPayload = (subscription: Subscription): AcquisitionApiPayload => {
    const payload: AcquisitionApiPayload = {
        eventTimeStamp : subscription.startTimestamp,
        product: subscription.googlePayload?.productId ?? "uk.co.guardian.feast.access", // Scala model to be updated and value to be used here.
        amount: undefined, // Tom said to leave it undefined
        country: subscription.googlePayload?.rawResponse?.regionCode ?? "GB",
        currency: "GBP", // We do not have access to the currency in the Google Subscription object
        componentId: undefined, // TODO: which value would go there ?
        componentType: undefined, // TODO: which value would go there ?
        campaignCode: undefined,
        source: undefined,
        referrerUrl: undefined,
        abTests: [],
        paymentFrequency: "", // from rawResponse.lineItems.offerDetails.basePlanId: feast-annual
        paymentProvider: undefined,
        printOptions: undefined,
        browserId: undefined,
        identityId: undefined,
        pageViewId: undefined,
        referrerPageViewId: undefined,
        labels: [],
        promoCode: undefined,
        reusedExistingPaymentMethod: false,
        readerType: "Direct",
        acquisitionType: "Purchase",
        zuoraSubscriptionNumber: undefined,
        contributionId: undefined,
        paymentId: undefined,
        queryParameters: [],
        platform: undefined,
        postalCode: undefined,
        state: undefined,
        email: undefined
    }
    return payload;
}

const postPayload = async (payload: AcquisitionApiPayload) => {
    const endpoint = "https://api.guardian.com/acquisition-events"; // TODO: get the right value
    const additionalHeaders = {Authorization: `Bearer TEST_TOKEN`};
    const body = JSON.stringify(payload);
    await restClient.client.post(endpoint, body, additionalHeaders);
}

const processSQSRecord = async (record: SQSRecord): Promise<void> => {
    console.log(`[48bb04a0] calling processRecord (Google version) with record ${JSON.stringify(record)}`);
    const subscriptionFromQueue: Subscription = JSON.parse(record.body);
    console.log(`[cf7fd559] subscriptionFromQueue: ${JSON.stringify(subscriptionFromQueue)}`);
    // We are now collecting the the data required to query the Google Play API (v2) for subscription details
    const purchaseToken = subscriptionFromQueue.subscriptionId;
    const packageName = "uk.co.guardian.feast";
    const subscriptionFromGoogle = await fetchGoogleSubscriptionV2(purchaseToken, packageName);
    console.log(`[4fe9b14b] subscriptionFromGoogle: ${JSON.stringify(subscriptionFromGoogle)}`);
    const subscriptionUpdated: Subscription = googleSubscriptionToSubscription(purchaseToken, packageName, subscriptionFromGoogle);
    console.log(`[2ba4a5a7] subscriptionUpdated: ${JSON.stringify(subscriptionUpdated)}`);
    const payload = googleSubscriptionToAcquisitionApiPayload(subscriptionUpdated);
    await postPayload(payload);
}

export const handler = async (event: SQSEvent): Promise<void> => {
    console.log('[e01d21bb] Feast Google Acquisition Events Lambda has been called');
    console.log(`[8b8b51a5] Processing ${event.Records.length} records`);
    const promises = event.Records.map( async (record: SQSRecord) => {
        await processSQSRecord(record)
    });
    await Promise.all(promises);
    console.log('[a2231ca1] Finished processing records');
}