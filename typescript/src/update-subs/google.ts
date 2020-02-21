import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda';
import {makeCancellationTime, parseAndStoreSubscriptionUpdate} from './updatesub';
import {Subscription} from "../models/subscription";
import {ProcessingError} from "../models/processingError";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {GoogleSubscriptionReference} from "../models/subscriptionReference";
import {fromGooglePackageName} from "../services/appToPlatform";
import {fetchGoogleSubscription, GOOGLE_PAYMENT_STATE} from "../services/google-play";

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
        throw new ProcessingError("There was no data in google response", true);
    }

    const expiryDate = new Date(Number.parseInt(response.expiryTimeMillis));
    const freeTrial = response.paymentState === GOOGLE_PAYMENT_STATE.FREE_TRIAL;
    return [new Subscription(
        sub.purchaseToken,
        new Date(Number.parseInt(response.startTimeMillis)).toISOString(),
        expiryDate.toISOString(),
        makeCancellationTime(response.userCancellationTimeMillis),
        response.autoRenewing,
        sub.subscriptionId,
        fromGooglePackageName(sub.packageName)?.toString(),
        freeTrial,
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
