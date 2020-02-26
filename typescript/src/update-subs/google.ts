import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda';
import {parseAndStoreSubscriptionUpdate} from './updatesub';
import {Subscription} from "../models/subscription";
import {ProcessingError} from "../models/processingError";
import {dateToSecondTimestamp, optionalMsToDate, thirtyMonths} from "../utils/dates";
import {GoogleSubscriptionReference} from "../models/subscriptionReference";
import {fromGooglePackageName} from "../services/appToPlatform";
import {fetchGoogleSubscription, GOOGLE_PAYMENT_STATE} from "../services/google-play";
import {PRODUCT_BILLING_PERIOD} from "../services/productBillingPeriod";

async function getGoogleSubResponse(record: SQSRecord): Promise<Subscription[]> {

    const sub = JSON.parse(record.body) as GoogleSubscriptionReference;

    let response;
    try {
        response = await fetchGoogleSubscription(sub.subscriptionId, sub.purchaseToken, sub.packageName);
    } catch (exception) {
        if (exception.statusCode === 410) {
            console.log(`Purchase expired a very long time ago, ignoring`);
            return [];
        } if (exception.statusCode === 400 && exception?.result?.error?.message === "Invalid Value") {
            console.warn("The purchase token value was invalid, we can't recover from this error", exception);
            throw new ProcessingError("Invalid token value", false);
        } else {
            throw exception;
        }
    }

    if (!response) {
        throw new ProcessingError("There was no data in the response from google", true);
    }

    const expiryDate = optionalMsToDate(response.expiryTimeMillis);
    if (expiryDate === null) {
        throw new ProcessingError(`Unable to parse the expiryTimeMillis field ${response.expiryTimeMillis}`, false)
    }

    const startDate = optionalMsToDate(response.startTimeMillis);
    if (startDate === null) {
        throw new ProcessingError(`Unable to parse the startTimeMillis field ${response.startTimeMillis}`, false)
    }

    let billingPeriod = PRODUCT_BILLING_PERIOD[sub.subscriptionId];
    if (billingPeriod === undefined) {
        console.warn(`Unable to get the billing period, unknown google subscription ID ${sub.subscriptionId}`);
    }

    const freeTrial = response.paymentState === GOOGLE_PAYMENT_STATE.FREE_TRIAL;
    return [new Subscription(
        sub.purchaseToken,
        startDate.toISOString(),
        expiryDate.toISOString(),
        optionalMsToDate(response.userCancellationTimeMillis)?.toISOString(),
        response.autoRenewing,
        sub.subscriptionId,
        fromGooglePackageName(sub.packageName)?.toString(),
        freeTrial,
        billingPeriod,
        response,
        undefined,
        null,
        dateToSecondTimestamp(thirtyMonths(expiryDate)),
    )];
}

export async function handler(event: SQSEvent) {
    const promises = event.Records.map(record => parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse));
    
    return Promise.all(promises)
        .then(_  => "OK")

}
