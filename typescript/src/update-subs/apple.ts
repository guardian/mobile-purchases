import {SQSEvent, SQSRecord} from 'aws-lambda'
import {makeTimeToLive, parseAndStoreSubscriptionUpdate} from "./updatesub";
import {AppleSubscription} from "../models/subscription";
import {AppleSubscriptionReference} from "../models/appleSubscriptionReference";
import fetch from 'node-fetch';
import {Response} from 'node-fetch';
import {Stage} from "../utils/appIdentity";
import {msToFormattedString, optionalMsToFormattedString} from "../utils/dates";

const receiptEndpoint = (Stage === "PROD") ? "https://buy.itunes.apple.com/verifyReceipt" : "https://sandbox.itunes.apple.com/verifyReceipt";
const environment = (Stage === "PROD") ? "Production" : "Sandbox";

interface AppleValidatedRenewalInfo {
    auto_renew_status: "0" | "1",
    original_transaction_id: string
}

interface AppleValidatedReceiptInfo {
    cancellation_date_ms?: string,
    expires_date_ms: string,
    original_purchase_date_ms: string,
    original_transaction_id: string
    product_id: string,
}

// there are more fields, I cherry picked what was relevant
// https://developer.apple.com/documentation/appstorereceipts/responsebody
interface AppleValidationResponse {
    environment: string,
    "is-retryable": boolean,
    latest_receipt: string,
    latest_receipt_info: [AppleValidatedReceiptInfo],
    pending_renewal_info: [AppleValidatedRenewalInfo],
    status: number
}

function validateReceipt(subRef: AppleSubscriptionReference): Promise<Response> {
    return fetch(receiptEndpoint, {method: 'POST', body: JSON.stringify({
            "receipt-data": subRef.receipt,
            "password": subRef.password,
            "exclude-old-transactions": true
        })}).then(response => {
        if (!response.ok) {
            console.error(`Impossible to validate the receipt, got ${response.status} ${response.statusText} from receiptEndpoint for ${subRef.receipt}`)
            throw new Error("Impossible to validate receipt");
        }
        return response
    })
}

function checkResponseStatus(response: AppleValidationResponse): AppleValidationResponse {
    if (response.status != 0) {
        console.error(`Invalid receipt, got status ${response.status} for ${response.latest_receipt}`);
        throw new Error(`Invalid receipt, got status ${response.status}`);
    }
    if (response.environment !== environment) {
        console.warn(`Wrong environment. We're in ${environment}, receipt was ${response.environment}`);
        throw new Error(`Wrong environment`);
    }
    if (!response.latest_receipt_info) {
        console.error(`No receipt info`);
        throw new Error(`Invalid validation response, no receipt info`);
    }
    if (response.latest_receipt_info.length != 1) {
        console.error(`Invalid latest_receipt_info array length. Got ${response.latest_receipt_info.length} expected 1`);
        throw new Error(`Invalid latest_receipt_info array length.`);
    }
    if (!response.pending_renewal_info) {
        console.error(`No receipt info`);
        throw new Error(`Invalid validation response, no receipt info`);
    }
    if (response.pending_renewal_info.length != 1) {
        console.error(`Invalid pending_renewal_info array length. Got ${response.latest_receipt_info.length} expected 1`);
        throw new Error(`Invalid pending_renewal_info array length.`);
    }
    if (response.pending_renewal_info[0].original_transaction_id != response.latest_receipt_info[0].original_transaction_id) {
        console.error(`original_transaction_id don't match`);
        throw new Error(`original_transaction_id don't match`);
    }
    return response;
}

function toAppleSubscription(response: AppleValidationResponse, subRef: AppleSubscriptionReference): AppleSubscription {
    const latestReceiptInfo = response.latest_receipt_info[0];

    let autoRenewStatus: boolean = false;
    if (response.pending_renewal_info[0].auto_renew_status === "1") {
        autoRenewStatus = true;
    }

    return new AppleSubscription(
        latestReceiptInfo.original_transaction_id,
        response.latest_receipt,
        msToFormattedString(latestReceiptInfo.original_purchase_date_ms),
        msToFormattedString(latestReceiptInfo.expires_date_ms),
        optionalMsToFormattedString(latestReceiptInfo.cancellation_date_ms),
        autoRenewStatus,
        response,
        makeTimeToLive(new Date(Date.now()))
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
    const emptyPromises = event.Records.map( record => parseAndStoreSubscriptionUpdate(record, sqsRecordToAppleSubscription));

    return Promise.all(emptyPromises)
        .then( value => {
            console.log(`Processed ${event.Records.length} subscriptions`);
            return "OK";
        })
        .catch(error => {
            console.error("Error processing subsctption update: ", error);
            return "Error";
        })


}