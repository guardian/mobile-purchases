import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda'
import {parseAndStoreSubscriptionUpdate} from "./updatesub";
import {Subscription} from "../models/subscription";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {AppleSubscriptionReference} from "../models/subscriptionReference";
import {AppleValidationResponse, validateReceipt} from "../services/appleValidateReceipts";
import {Platform} from "../models/platform";

const bundleToPlatform: {[bundle: string]: string} = {
    "uk.co.guardian.iphone2": Platform.Ios.toString(),
    "uk.co.guardian.gce": Platform.IosEdition.toString(),
    "uk.co.guardian.puzzles": Platform.IosPuzzles.toString()
};

function toAppleSubscription(response: AppleValidationResponse): Subscription {
    const latestReceiptInfo = response.latestReceiptInfo;

    let autoRenewStatus: boolean = false;
    if (response.latestReceiptInfo.autoRenewStatus) {
        autoRenewStatus = true;
    }

    let cancellationDate: string | undefined;
    if (latestReceiptInfo.cancellationDate) {
        cancellationDate = latestReceiptInfo.cancellationDate.toISOString()
    }

    const platform = (response.latestReceiptInfo.bundleId) ? bundleToPlatform[response.latestReceiptInfo.bundleId] : undefined;

    return new Subscription(
        latestReceiptInfo.originalTransactionId,
        latestReceiptInfo.originalPurchaseDate.toISOString(),
        latestReceiptInfo.expiresDate.toISOString(),
        cancellationDate,
        autoRenewStatus,
        latestReceiptInfo.productId,
        platform,
        null,
        response.latestReceipt,
        response.originalResponse,
        dateToSecondTimestamp(thirtyMonths(latestReceiptInfo.expiresDate))
    )
}

function sqsRecordToAppleSubscription(record: SQSRecord): Promise<Subscription[]> {
    const subRef = JSON.parse(record.body) as AppleSubscriptionReference;

    // sandboxRetry is set to false such that in production we don't store any sandbox receipt that would have snuck all the way here
    // In CODE or locally the default endpoint will be sanbox therefore no retry is necessary
    return validateReceipt(subRef.receipt, {sandboxRetry: false})
        .then(subs => subs.map(toAppleSubscription))
}

export async function handler(event: SQSEvent): Promise<String> {
    const promises = event.Records.map( record => parseAndStoreSubscriptionUpdate(record, sqsRecordToAppleSubscription));

    return Promise.all(promises)
        .then( _ => "OK");
}