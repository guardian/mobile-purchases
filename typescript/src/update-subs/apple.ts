import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda'
import {parseAndStoreSubscriptionUpdate} from "./updatesub";
import {Subscription} from "../models/subscription";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {AppleSubscriptionReference} from "../models/subscriptionReference";
import {AppleValidationResponse, validateReceipt} from "../services/appleValidateReceipts";

function toAppleSubscription(response: AppleValidationResponse): Subscription {
    const latestReceiptInfo = response.latestReceiptInfo;

    let autoRenewStatus: boolean = false;
    if (response.autoRenewStatus) {
        autoRenewStatus = true;
    }

    let cancellationDate: string | undefined;
    if (latestReceiptInfo.cancellationDate) {
        cancellationDate = latestReceiptInfo.cancellationDate.toISOString()
    }

    return new Subscription(
        latestReceiptInfo.originalTransactionId,
        latestReceiptInfo.originalPurchaseDate.toISOString(),
        latestReceiptInfo.expiresDate.toISOString(),
        cancellationDate,
        autoRenewStatus,
        latestReceiptInfo.productId,
        null,
        response.latestReceipt,
        response,
        dateToSecondTimestamp(thirtyMonths(latestReceiptInfo.expiresDate))
    )
}

function sqsRecordToAppleSubscription(record: SQSRecord): Promise<Subscription> {
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