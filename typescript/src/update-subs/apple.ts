import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda'
import {parseAndStoreSubscriptionUpdate} from "./updatesub";
import {AppleSubscription} from "../models/subscription";
import {dateToSecondTimestamp, msToFormattedString, optionalMsToFormattedString, thirtyMonths} from "../utils/dates";
import {AppleSubscriptionReference} from "../models/subscriptionReference";
import {AppleValidationResponse, validateReceipt} from "../services/appleValidateReceipts";

function toAppleSubscription(response: AppleValidationResponse): AppleSubscription {
    const latestReceiptInfo = response.latestReceiptInfo;

    let autoRenewStatus: boolean = false;
    if (response.autoRenewStatus) {
        autoRenewStatus = true;
    }

    let cancellationDate: string | undefined;
    if (latestReceiptInfo.cancellationDate) {
        cancellationDate = latestReceiptInfo.cancellationDate.toISOString()
    }

    return new AppleSubscription(
        latestReceiptInfo.originalTransactionId,
        latestReceiptInfo.originalPurchaseDate.toISOString(),
        latestReceiptInfo.expiresDate.toISOString(),
        cancellationDate,
        autoRenewStatus,
        latestReceiptInfo.productId,
        dateToSecondTimestamp(thirtyMonths(latestReceiptInfo.expiresDate)),
        response.latestReceipt,
        response
    )
}

function sqsRecordToAppleSubscription(record: SQSRecord): Promise<AppleSubscription> {
    const subRef = JSON.parse(record.body) as AppleSubscriptionReference;

    return validateReceipt(subRef.receipt)
        .then(toAppleSubscription)
}

export async function handler(event: SQSEvent): Promise<String> {
    const promises = event.Records.map( record => parseAndStoreSubscriptionUpdate(record, sqsRecordToAppleSubscription));

    return Promise.all(promises)
        .then( value => {
            console.log(`Processed ${event.Records.length} subscriptions`);
            return "OK";
        });
}