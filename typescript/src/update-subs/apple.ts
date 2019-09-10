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

    const expiryDate = new Date(Number.parseInt(latestReceiptInfo.expires_date));

    return new AppleSubscription(
        latestReceiptInfo.original_transaction_id,
        msToFormattedString(latestReceiptInfo.original_purchase_date_ms),
        msToFormattedString(latestReceiptInfo.expires_date),
        optionalMsToFormattedString(latestReceiptInfo.cancellation_date_ms),
        autoRenewStatus,
        latestReceiptInfo.product_id,
        dateToSecondTimestamp(thirtyMonths(expiryDate)),
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