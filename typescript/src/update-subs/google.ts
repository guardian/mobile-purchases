import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda';
import {parseAndStoreSubscriptionUpdate} from './updatesub';
import {Subscription} from "../models/subscription";
import {ProcessingError} from "../models/processingError";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {GoogleSubscriptionReference} from "../models/subscriptionReference";
import {fromGooglePackageName} from "../services/appToPlatform";
import {fetchGoogleSubscription} from "../services/google-play";

async function getGoogleSubResponse(record: SQSRecord): Promise<Subscription[]> {

    const sub = JSON.parse(record.body) as GoogleSubscriptionReference;

    const response = await fetchGoogleSubscription(sub.purchaseToken, sub.packageName);

    if (response.startTime === null) {
        throw new ProcessingError(`Unable to proceed as the subscription does not have a startTime`, false)
    }

    return [new Subscription(
        sub.purchaseToken,
        response.startTime.toISOString(),
        response.expiryTime.toISOString(),
        response.userCancellationTime?.toISOString(),
        response.autoRenewing,
        response.productId,
        fromGooglePackageName(sub.packageName)?.toString(),
        response.freeTrial,
        response.billingPeriodDuration,
        response,
        undefined,
        null,
        dateToSecondTimestamp(thirtyMonths(response.expiryTime)),
    )];
}

export async function handler(event: SQSEvent) {
    const promises = event.Records.map(record => parseAndStoreSubscriptionUpdate(record, getGoogleSubResponse));
    
    return Promise.all(promises)
        .then(_  => "OK")

}
