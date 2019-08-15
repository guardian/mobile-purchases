import 'source-map-support/register'
import {SQSEvent, SQSRecord} from 'aws-lambda'
import {makeTimeToLive, parseAndStoreSubscriptionUpdate} from "./updatesub";
import {AppleSubscription} from "../models/subscription";
import {AppleSubscriptionReference} from "../models/appleSubscriptionReference";
import fetch from 'node-fetch';
import {Response} from 'node-fetch';
import {Stage} from "../utils/appIdentity";
import {msToFormattedString, optionalMsToFormattedString} from "../utils/dates";
import {ProcessingError} from "../models/processingError";

// const receiptEndpoint = (Stage === "PROD") ? "https://buy.itunes.apple.com/verifyReceipt" : "https://sandbox.itunes.apple.com/verifyReceipt";
// const environment = (Stage === "PROD") ? "Production" : "Sandbox";
const receiptEndpoint = "https://buy.itunes.apple.com/verifyReceipt";
const environment = "Production";

interface AppleValidatedReceiptInfo {
    cancellation_date_ms?: string,
    expires_date: string,
    original_purchase_date_ms: string,
    original_transaction_id: string
    product_id: string,
}

// there are more fields, I cherry picked what was relevant
// https://developer.apple.com/documentation/appstorereceipts/responsebody
interface AppleValidationResponse {
    auto_renew_status: 0 | 1,
    "is-retryable": boolean,
    latest_receipt: string,
    latest_receipt_info: AppleValidatedReceiptInfo,
    status: number
}

function validateReceipt(subRef: AppleSubscriptionReference): Promise<Response> {
    return fetch(receiptEndpoint, {method: 'POST', body: JSON.stringify({
            "receipt-data": subRef.receipt,
            "password": subRef.password,
            "exclude-old-transactions": true
        })}).then(response => {
        if (!response.ok) {
            console.error(`Impossible to validate the receipt, got ${response.status} ${response.statusText} from receiptEndpoint for ${subRef.receipt}`);
            throw new ProcessingError("Impossible to validate receipt", true);
        }
        return response
    })
}

function checkResponseStatus(response: AppleValidationResponse): AppleValidationResponse {
    if ((response.status >= 21100 && response.status <= 21199) || response["is-retryable"]) {
        console.error(`Server error received from Apple, got status ${response.status} for ${response.latest_receipt}, will retry`);
        throw new ProcessingError(`Server error, status ${response.status}`, true);
    }
    if (response.status != 0 && response.status != 21006) {
        console.error(`Invalid receipt, got status ${response.status} for ${response.latest_receipt}`);
        throw new ProcessingError(`Invalid receipt, got status ${response.status}`);
    }
    if (!response.latest_receipt_info) {
        console.error(`No receipt info`);
        throw new ProcessingError(`Invalid validation response, no receipt info`);
    }
    return response;
}

function toAppleSubscription(response: AppleValidationResponse, subRef: AppleSubscriptionReference): AppleSubscription {
    const latestReceiptInfo = response.latest_receipt_info;

    let autoRenewStatus: boolean = false;
    if (response.auto_renew_status === 1) {
        autoRenewStatus = true;
    }

    return new AppleSubscription(
        latestReceiptInfo.original_transaction_id,
        msToFormattedString(latestReceiptInfo.original_purchase_date_ms),
        msToFormattedString(latestReceiptInfo.expires_date),
        optionalMsToFormattedString(latestReceiptInfo.cancellation_date_ms),
        autoRenewStatus,
        latestReceiptInfo.product_id,
        makeTimeToLive(new Date(Date.now())),
        response.latest_receipt,
        response
    )
}

function sqsRecordToAppleSubscription(record: SQSRecord): Promise<AppleSubscription> {
    const subRef = JSON.parse(record.body) as AppleSubscriptionReference;

    return validateReceipt(subRef)
        .then(response => response.json())
        .then(body => body as AppleValidationResponse)
        .then(checkResponseStatus)
        .then(response => toAppleSubscription(response, subRef))
}

export async function handler(event: SQSEvent): Promise<String> {
    const promises = event.Records.map( record => parseAndStoreSubscriptionUpdate(record, sqsRecordToAppleSubscription));

    return Promise.all(promises)
        .then( value => {
            console.log(`Processed ${event.Records.length} subscriptions`);
            return "OK";
        });
}