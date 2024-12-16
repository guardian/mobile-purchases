import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { Subscription } from "../../models/subscription";
import { GoogleSubscription, fetchGoogleSubscriptionV2 } from "../../services/google-play-v2";
import { googlePackageNameToPlatform } from "../../services/appToPlatform";
import { dateToSecondTimestamp, thirtyMonths } from "../../utils/dates";
import { restClient } from "../../utils/restClient";
import { getConfigValue } from "../../utils/ssmConfig"
import { Stage } from "../../utils/appIdentity"

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
    abTests: void[], // this will have to be updated later if we want to use it
    paymentFrequency: string,
    paymentProvider?: void, // this will have to be updated later if we want to use it
    printOptions?: void, // this will have to be updated later if we want to use it
    browserId?: string,
    identityId?: string,
    pageViewId?: string,
    referrerPageViewId?: string,
    labels: void[],
    promoCode?: string,
    reusedExistingPaymentMethod: boolean,
    readerType: string,
    acquisitionType: string,
    zuoraSubscriptionNumber?: string,
    contributionId?: string,
    paymentId: string, // optional in the acquisition API model, but required by Data Design, see comment id: e3f790af 
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

const countryToCurr = {
    "GB": "GBP", // United Kingdom - Pound Sterling

    // Rest of Europe
    "AL": "ALL", // Albania
    "AD": "EUR", // Andorra
    "AT": "EUR", // Austria
    "BY": "BYN", // Belarus
    "BE": "EUR", // Belgium
    "BA": "BAM", // Bosnia & Herzegovina
    "BG": "BGN", // Bulgaria
    "HR": "EUR", // Croatia
    "CY": "EUR", // Cyprus
    "CZ": "CZK", // Czech Republic
    "DK": "DKK", // Denmark
    "EE": "EUR", // Estonia
    "FI": "EUR", // Finland
    "FR": "EUR", // France
    "DE": "EUR", // Germany
    "GR": "EUR", // Greece
    "HU": "HUF", // Hungary
    "IS": "ISK", // Iceland
    "IE": "EUR", // Ireland
    "IT": "EUR", // Italy
    "XK": "EUR", // Kosovo
    "LV": "EUR", // Latvia
    "LI": "CHF", // Liechtenstein
    "LT": "EUR", // Lithuania
    "LU": "EUR", // Luxembourg
    "MT": "EUR", // Malta
    "MD": "MDL", // Moldova
    "MC": "EUR", // Monaco
    "ME": "EUR", // Montenegro
    "NL": "EUR", // Netherlands
    "MK": "MKD", // North Macedonia
    "NO": "NOK", // Norway
    "PL": "PLN", // Poland
    "PT": "EUR", // Portugal
    "RO": "RON", // Romania
    "SM": "EUR", // San Marino
    "RS": "RSD", // Serbia
    "SK": "EUR", // Slovakia
    "SI": "EUR", // Slovenia
    "ES": "EUR", // Spain
    "SE": "SEK", // Sweden
    "CH": "CHF", // Switzerland
    "TR": "TRY", // Turkey
    "UA": "UAH", // Ukraine
    "VA": "EUR", // Vatican City

    // Rest of the world
    "US": "USD", // United States - Dollar
    "JP": "JPY", // Japan - Yen
    "CN": "CNY", // China - Yuan Renminbi
    "IN": "INR", // India - Indian Rupee
    "CA": "CAD", // Canada - Canadian Dollar
    "AU": "AUD", // Australia - Australian Dollar
    "BR": "BRL",  // Brazil - Brazilian Real
};

const countryToCurrency = (country: string): string => {
    const supportedCountries = Object.keys(countryToCurr);
    if (supportedCountries.includes(country)) {
        return countryToCurr[country as keyof typeof countryToCurr];
    }
    // Throwing an error here is not ideal, but it will do for the moment...
    throw new Error(`[acba643d] Country ${country} is not supported`);
}

const googleSubscriptionToAcquisitionApiPayload = (subscription: Subscription): AcquisitionApiPayload => {
    
    const eventTimeStamp = subscription.startTimestamp;
    const product = "FEAST_APP";
    const amount = undefined; // Tom said to leave it undefined
    const country = subscription.googlePayload?.rawResponse?.regionCode ?? "GB";

    // We do not have access to the currency in the Google Subscription object
    // mapping of country to currency is not ideal but the best solution for now

    const currency = countryToCurrency(country);  

    const componentId = undefined;
    const componentType = undefined;
    const campaignCode = undefined;
    const source = undefined;
    const referrerUrl = undefined;
    const abTests: void[] = [];

    // from rawResponse.lineItems.offerDetails.basePlanId: feast-annual
    // We are going to be mapping to one of the allowed values
    // "ONE_OFF"
    // "MONTHLY"
    // "QUARTERLY"
    // "SIX_MONTHLY"
    // "ANNUALLY"
    // TODO: implement the mapping.
    const paymentFrequency = "ANNUALLY";

    const paymentProvider = undefined;
    const printOptions = undefined;
    const browserId = undefined;
    const identityId = undefined;
    const pageViewId = undefined;
    const referrerPageViewId = undefined;
    const labels: void[] = [];
    const promoCode = undefined;
    const reusedExistingPaymentMethod = false;
    const readerType = "Direct";
    const acquisitionType = "PURCHASE";
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
    }
    return payload;
}

const postPayload = async (payload: AcquisitionApiPayload) => {
    // Date: 12 Dec 2024
    // We are only performing that operation on PROD, because we do not have a code endpoint 
    // the parameter `acquisitionApiUrl` has only been defined for stage PROD in Paremeter Store
    if (Stage === "PROD") {
        const url = await getConfigValue<string>("acquisitionApiUrl");
        console.log(`[9118860a] acquisition api url: ${url}`);
        const additionalHeaders = {"Content-Type": "application/json"};
        const body = JSON.stringify(payload);
        await restClient.client.post(url, body, additionalHeaders);
    } else{
        console.log(`[69460012] postPayload has been called with payload: ${JSON.stringify(payload)}`);
    }
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
    console.log(`[d522f940] acquisition api payload: ${JSON.stringify(payload)}`);
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