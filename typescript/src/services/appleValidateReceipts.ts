import {Response} from "node-fetch";
import {getConfigValue} from "../utils/ssmConfig";
import {ProcessingError} from "../models/processingError";
import {Stage} from "../utils/appIdentity";
import fetch from 'node-fetch';

export interface AppleValidatedReceiptInfo {
    cancellation_date_ms?: string,
    expires_date: string,
    original_purchase_date_ms: string,
    original_transaction_id: string
    product_id: string,
}

// there are more fields, I cherry picked what was relevant
// https://developer.apple.com/documentation/appstorereceipts/responsebody
export interface AppleValidationResponse {
    auto_renew_status: 0 | 1,
    "is-retryable": boolean,
    latest_receipt: string,
    latest_receipt_info: AppleValidatedReceiptInfo,
    status: number
}

const receiptEndpoint = (Stage === "PROD") ? "https://buy.itunes.apple.com/verifyReceipt" : "https://sandbox.itunes.apple.com/verifyReceipt";

function callValidateReceipt(receipt: string): Promise<Response> {
    return getConfigValue<string>("apple.password")
        .then(password => {
            const body = JSON.stringify({
                "receipt-data": receipt,
                "password": password,
                "exclude-old-transactions": true
            });
            return fetch(receiptEndpoint, { method: 'POST', body: body});
        }).then(response => {
            if (!response.ok) {
                console.error(`Impossible to validate the receipt, got ${response.status} ${response.statusText} from receiptEndpoint for ${receipt}`);
                throw new ProcessingError("Impossible to validate receipt", true);
            }
            return response
        })
}

function checkResponseStatus(response: AppleValidationResponse): AppleValidationResponse {
    if ((response.status >= 21100 && response.status <= 21199) || response["is-retryable"]) {
        console.error(`Server error received from Apple, got status ${response.status}, will retry`);
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

export function validateReceipt(receipt: string): Promise<AppleValidationResponse> {
    return callValidateReceipt(receipt)
        .then(response => response.json())
        .then(body => body as AppleValidationResponse)
        .then(checkResponseStatus)
}