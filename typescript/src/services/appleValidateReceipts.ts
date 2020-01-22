import {Response} from "node-fetch";
import {getConfigValue} from "../utils/ssmConfig";
import {ProcessingError} from "../models/processingError";
import {Stage} from "../utils/appIdentity";
import fetch from 'node-fetch';
import {msToDate, optionalMsToDate} from "../utils/dates";
import {Option} from "../utils/option";

export interface PendingRenewalInfo {
    auto_renew_product_id?: string,
    auto_renew_status: "0" | "1",
    expiration_intent?: "1" | "2" | "3" | "4" | "5",
    grace_period_expires_date_ms?: string,
    is_in_billing_retry_period?: "0" | "1"
    original_transaction_id: string
    product_id: string
}

export interface AppleValidatedReceiptServerInfo {
    cancellation_date_ms?: string,
    expires_date?: string,
    expires_date_ms?: string,
    original_purchase_date_ms: string,
    original_transaction_id: string
    product_id: string,
    is_trial_period: string
}

export interface ValidationOptions {
    sandboxRetry: boolean
}

// there are more fields, I cherry picked what was relevant
// https://developer.apple.com/library/archive/releasenotes/General/ValidateAppStoreReceipt/Chapters/ValidateRemotely.html
export interface AppleValidationServerResponse {
    auto_renew_status: 0 | 1,
    "is-retryable"?: boolean,
    latest_receipt?: string,
    // yes you've read the type well. It can both be an array or a value, good luck parsing that
    latest_receipt_info?: AppleValidatedReceiptServerInfo | AppleValidatedReceiptServerInfo[],
    latest_expired_receipt_info?: AppleValidatedReceiptServerInfo,
    pending_renewal_info?: PendingRenewalInfo[],
    status: number
}

export interface AppleValidatedReceiptInfo {
    autoRenewStatus: boolean,
    trialPeriod: boolean,
    cancellationDate: Option<Date>,
    expiresDate: Date,
    originalPurchaseDate: Date,
    originalTransactionId: string
    productId: string,
}

// this is a sanitised and more sensible version of what the response should be
export interface AppleValidationResponse {
    isRetryable: boolean,
    latestReceipt: string,
    latestReceiptInfo: AppleValidatedReceiptInfo,
    originalResponse: any
}


const sandboxReceiptEndpoint = "https://sandbox.itunes.apple.com/verifyReceipt";
const prodReceiptEndpoint = "https://buy.itunes.apple.com/verifyReceipt";
const receiptEndpoint = (Stage === "PROD") ? prodReceiptEndpoint : sandboxReceiptEndpoint;

function callValidateReceipt(receipt: string, forceSandbox: boolean = false): Promise<Response> {
    const endpoint = forceSandbox ? sandboxReceiptEndpoint : receiptEndpoint;
    return getConfigValue<string>("apple.password")
        .then(password => {
            const body = JSON.stringify({
                "receipt-data": receipt,
                "password": password,
                "exclude-old-transactions": true
            });
            return fetch(endpoint, { method: 'POST', body: body});
        }).then(response => {
            if (!response.ok) {
                console.error(`Impossible to validate the receipt, got ${response.status} ${response.statusText} from ${endpoint} for ${receipt}`);
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
    if (response.status === 21007) {
        const msg = `Got status 21007 and we're in ${Stage}, so we are processing a receipt from the wrong environment. ` +
            `This shouldn't have happen as we should already retry receipts in sandbox if the return code was 21007`;
        console.error(msg);
        throw new ProcessingError(`Got status ${response.status} and we're in ${Stage}`);
    }
    if (response.status === 21008) {
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

export function toSensiblePayloadFormat(response: AppleValidationServerResponse, receipt: string): AppleValidationResponse[] {

    function expiryDate(receiptServerInfo: AppleValidatedReceiptServerInfo): number {
        if (receiptServerInfo.expires_date_ms) {
            return Number.parseInt(receiptServerInfo.expires_date_ms);
        } else if (receiptServerInfo.expires_date) {
            return Number.parseInt(receiptServerInfo.expires_date);
        } else {
            throw new ProcessingError("Receipt has no expiry, this should have been filtered by now", false);
        }
    }

    function getReceiptInfo(): AppleValidatedReceiptServerInfo[] {
        if (response.latest_receipt_info) {
            if (Array.isArray(response.latest_receipt_info)) {
                const latestReceipt = response.latest_receipt_info as AppleValidatedReceiptServerInfo[];
                if (latestReceipt.length == 0) {
                    console.error(`Invalid validation response, empty receipt info array`);
                    throw new ProcessingError(`Invalid validation response, empty receipt info array`);
                }

                // only keep receipts that have an expiry date, those who don't aren't subscriptions or are pre 2011
                const filteredLatestReceipt = latestReceipt.filter(receipt => receipt.expires_date || receipt.expires_date_ms);

                const deDupedReceipts = filteredLatestReceipt
                    .sort((r1, r2) => expiryDate(r1) - expiryDate(r2)) // most recent last
                    .reduce((acc: {[key: string]: AppleValidatedReceiptServerInfo}, current) => {
                        acc[current.original_transaction_id] = current;
                        return acc;
                    }, {});

                return Object.values(deDupedReceipts)
            } else {
                return [response.latest_receipt_info as AppleValidatedReceiptServerInfo];
            }
        } else {
            if (response.latest_expired_receipt_info) {
                return [response.latest_expired_receipt_info];
            } else {
                // should be impossible as this will be caught by checkResponseStatus
                console.error(`No receipt info`);
                throw new ProcessingError(`Invalid validation response, no receipt info`);
            }
        }
    }

    type PendingRenewalInfoById = {[id: string]: PendingRenewalInfo};
    const pendingRenewalInfoArray = response.pending_renewal_info ?? [];
    const pendingRenewalInfoById: PendingRenewalInfoById = pendingRenewalInfoArray.reduce((agg, value) => {
        agg[value.original_transaction_id] = value;
        return agg
    }, {} as PendingRenewalInfoById);

    return getReceiptInfo().map( receiptInfo => {
        const pendingRenewalInfo: PendingRenewalInfo = pendingRenewalInfoById[receiptInfo.original_transaction_id];
        const autoRenewStatus = pendingRenewalInfo ? pendingRenewalInfo.auto_renew_status === "1" : response.auto_renew_status === 1;

        return {
            isRetryable: response["is-retryable"] === true,
            latestReceipt: response.latest_receipt ?? receipt,
            latestReceiptInfo: {
                autoRenewStatus: autoRenewStatus,
                cancellationDate: optionalMsToDate(receiptInfo.cancellation_date_ms),
                expiresDate: new Date(expiryDate(receiptInfo)),
                originalPurchaseDate: msToDate(receiptInfo.original_purchase_date_ms),
                originalTransactionId: receiptInfo.original_transaction_id,
                productId: receiptInfo.product_id,
                trialPeriod: receiptInfo.is_trial_period === "true",
            },
            originalResponse: response
        };
    })
}

async function retryInSandboxIfNecessary(parsedResponse: AppleValidationServerResponse, receipt: string, options: ValidationOptions): Promise<AppleValidationServerResponse> {
    if (parsedResponse.status === 21007 && options.sandboxRetry) {
        console.log("Got status code 21007, retrying in Sandbox");
        return callValidateReceipt(receipt, true)
            .then(response => response.json())
            .then(body => body as AppleValidationServerResponse);
    } else {
        return parsedResponse;
    }
}

export function validateReceipt(receipt: string, options: ValidationOptions): Promise<AppleValidationResponse[]> {
    return callValidateReceipt(receipt)
        .then(response => response.json())
        .then(body => body as AppleValidationServerResponse)
        .then(parsedResponse => retryInSandboxIfNecessary(parsedResponse, receipt, options))
        .then(checkResponseStatus)
        .then(response => toSensiblePayloadFormat(response, receipt))
}