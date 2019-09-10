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
// https://developer.apple.com/library/archive/releasenotes/General/ValidateAppStoreReceipt/Chapters/ValidateRemotely.html
interface AppleValidationServerResponse {
    auto_renew_status: 0 | 1,
    "is-retryable": boolean,
    latest_receipt: string,
    // yes you've read the type well. It can both be an array or a value, good luck parsing that
    latest_receipt_info: AppleValidatedReceiptInfo | AppleValidatedReceiptInfo[],
    latest_expired_receipt_info: AppleValidatedReceiptInfo,
    status: number
}

// this is a sanitised and more sensible version of what the response should be
export interface AppleValidationResponse {
    autoRenewStatus: boolean,
    isRetryable: boolean,
    latestReceipt: string,
    latestReceiptInfo: AppleValidatedReceiptInfo
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

function checkResponseStatus(response: AppleValidationServerResponse): AppleValidationServerResponse {
    if ((response.status >= 21100 && response.status <= 21199) || response["is-retryable"]) {
        console.error(`Server error received from Apple, got status ${response.status}, will retry`);
        throw new ProcessingError(`Server error, status ${response.status}`, true);
    }
    if (response.status == 21007 || response.status == 21008) {
        console.error(`Got status ${response.status} and we're in ${Stage}, so we are processing a receipt from the wrong environment`);
        throw new ProcessingError(`Got status ${response.status} and we're in ${Stage}`);
    }
    if (response.status != 0 && response.status != 21006) {
        console.error(`Invalid receipt, got status ${response.status} for ${response.latest_receipt}`);
        throw new ProcessingError(`Invalid receipt, got status ${response.status}`);
    }
    if (!response.latest_receipt_info && !response.latest_expired_receipt_info) {
        console.error(`No receipt info`);
        throw new ProcessingError(`Invalid validation response, no receipt info`);
    }
    return response;
}

function toSensiblePayloadFormat(response: AppleValidationServerResponse, receipt: string): AppleValidationResponse {
    let receiptInfo: AppleValidatedReceiptInfo = response.latest_expired_receipt_info;
    if (response.latest_receipt_info) {
        if (Array.isArray(response.latest_receipt_info)) {
            const latestReceipt = response.latest_receipt_info as AppleValidatedReceiptInfo[];
            if (latestReceipt.length == 1) {
                receiptInfo = latestReceipt[0];
            } else if (latestReceipt.length > 1) {
                receiptInfo = latestReceipt[0];
                let longestSub = 0;
                latestReceipt.forEach(sub => {
                    if (longestSub < Number.parseInt(sub.expires_date)) {
                        longestSub = Number.parseInt(sub.expires_date);
                        receiptInfo = sub;
                    }
                });
            } else {
                console.error(`Invalid validation response, empty receipt info array`);
                throw new ProcessingError(`Invalid validation response, empty receipt info array`);
            }
        } else {
            receiptInfo = response.latest_receipt_info as AppleValidatedReceiptInfo;
        }
    }
    return {
        autoRenewStatus: (response.auto_renew_status === 1),
        isRetryable: response["is-retryable"],
        latestReceipt: response.latest_receipt || receipt,
        latestReceiptInfo: receiptInfo
    }
}

export function validateReceipt(receipt: string): Promise<AppleValidationResponse> {
    return callValidateReceipt(receipt)
        .then(response => response.json())
        .then(body => body as AppleValidationServerResponse)
        .then(checkResponseStatus)
        .then(response => toSensiblePayloadFormat(response, receipt))
}