import 'source-map-support/register'
import {parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {AppleSubscriptionReference} from "../models/subscriptionReference";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Option} from "../utils/option";
import {fromAppleBundle} from "../services/appToPlatform";
import {PendingRenewalInfo} from "../services/appleValidateReceipts";
import type {Result} from "@guardian/types";
import {ok, err, ResultKind} from "@guardian/types";

// this is the definition of a receipt as received by the server to server notification system.
// Not to be confused with apple's receipt validation receipt info (although they do look similar, they are different)
// See https://developer.apple.com/documentation/appstoreservernotifications/responsebody
export interface AppleReceiptInfo {
    transaction_id: string,
    product_id: string,
    original_transaction_id: string,
    web_order_line_item_id: string,
    quantity: string,
    purchase_date_ms: string,
    original_purchase_date_ms: string,
    expires_date: string,
    expires_date_ms: string,
    is_in_intro_offer_period: string,
    is_trial_period: string,
    item_id?: string,
    app_item_id?: string,
    unique_identifier?: string,
    unique_vendor_identifier?: string,
    bvrs?: string,
    version_external_identifier?: string
}

export interface UnifiedReceiptInfo {
    environment: string,
    latest_receipt: string,
    latest_receipt_info: AppleReceiptInfo[],
    pending_renewal_info: PendingRenewalInfo[],
    status: number
}

export interface StatusUpdateNotification {
    environment: string,
    bid: string,
    bvrs: string,
    notification_type: string,
    password?: string,
    original_transaction_id?: string,
    cancellation_date?: string,
    web_order_line_item_id?: string,
    unified_receipt: UnifiedReceiptInfo,
    auto_renew_status: string,
    auto_renew_adam_id?: string,
    auto_renew_product_id: string,
    expiration_intent?: string
}

type binaryStatus = "0" | "1"
type expirationIntent = "1" | "2" | "3" | "4" | "5"

const isObject = (a: unknown): a is Record<string, unknown> =>
    typeof a === 'object' && a !== null;

const parseArray = <A>(parseA: (a: unknown) => Result<string, A>) => (array: unknown): Result<string, A[]> => {
    const f = (acc: A[], remainder: unknown[]): Result<string, A[]> => {
        if (remainder.length === 0) {
            return ok(acc);
        }

        const [ item, ...tail ] = remainder;
        const parsed = parseA(item);

        if (parsed.kind === ResultKind.Ok) {
            return f([ ...acc, parsed.value ], tail);
        }

        return parsed;
    };

    if (Array.isArray(array)) {
        return f([], array);
    }

    return err("Is not an array");
};

function parseAppleReceiptInfo(payload: unknown):  Result<string, AppleReceiptInfo> {
    if(!isObject(payload)) {
        return err("The apple receipt info field that Apple gave us isn't an object")
    }
    console.log(`The keys of the apple receipt info: ${Object.keys(payload)}`);
    if(
        typeof payload.transaction_id === "string" &&
        typeof payload.product_id === "string" &&
        typeof payload.original_transaction_id === "string" &&
        (typeof payload.item_id === "string" || typeof payload.item_id === "undefined") &&
        (typeof payload.app_item_id === "string" || typeof payload.app_item_id === "undefined") &&
        typeof payload.web_order_line_item_id === "string" &&
        (typeof payload.unique_identifier === "string" || typeof payload.unique_identifier === "undefined") &&
        (typeof payload.unique_vendor_identifier === "string" || typeof payload.unique_vendor_identifier === "undefined") &&
        typeof payload.quantity === "string" &&
        typeof payload.purchase_date_ms === "string" &&
        typeof payload.original_purchase_date_ms === "string" &&
        typeof payload.expires_date === "string" &&
        typeof payload.expires_date_ms === "string" &&
        typeof payload.is_in_intro_offer_period === "string" &&
        typeof payload.is_trial_period === "string" &&
        (typeof payload.bvrs === "string" || typeof payload.bvrs === "undefined") &&
        (typeof payload.version_external_identifier === "string" || typeof payload.version_external_identifier === "undefined")
    ) {
        return ok({
            transaction_id: payload.transaction_id,
            product_id: payload.product_id,
            original_transaction_id: payload.original_transaction_id,
            item_id: payload.item_id,
            app_item_id: payload.app_item_id,
            web_order_line_item_id: payload.web_order_line_item_id,
            unique_identifier: payload.unique_identifier,
            unique_vendor_identifier: payload.unique_vendor_identifier,
            quantity: payload.quantity,
            purchase_date_ms: payload.purchase_date_ms,
            original_purchase_date_ms: payload.original_purchase_date_ms,
            expires_date: payload.expires_date,
            expires_date_ms: payload.expires_date_ms,
            is_in_intro_offer_period: payload.is_in_intro_offer_period,
            is_trial_period: payload.is_trial_period,
            bvrs: payload.bvrs,
            version_external_identifier: payload.version_external_identifier
        })
    }
    return err("Apple Receipt Info object from Apple cannot be parsed")
}

function parseBillingRetryPeriod(status: unknown): Result<string, binaryStatus | undefined> {
    if(status === undefined) {
        return ok(undefined)
    }
    return parseBinaryStatus(status);
}

function parseBinaryStatus(status: unknown): Result<string, binaryStatus> {
    if (typeof status !== 'string') {
        return err("Binary Status is not a string");
    }
    switch(status) {
        case "0":
        case "1":
            return ok(status);
        default:
            return err("Not a valid status")
    }
}

function parseExpirationIntent(status: unknown): Result<string, expirationIntent | undefined> {
    if(status === undefined) {
        return ok(undefined)
    }
    if (typeof status !== 'string') {
        return err("Expiration Intent is not a string");
    }
    switch(status) {
        case "1":
        case "2":
        case "3":
        case "4":
        case "5":
            return ok(status);
        default:
            return err("Not a valid status")
    }
}

function parsePendingRenewalInfo(payload: unknown):  Result<string, PendingRenewalInfo> {
    if(!isObject(payload)) {
        return err("The apple pending renewal info field that Apple gave us isn't an object")
    }
    console.log(`The keys of the pending renewal info: ${Object.keys(payload)}`);
    const autoRenewStatus = parseBinaryStatus(payload.auto_renew_status);
    const billingRetryPeriod = parseBillingRetryPeriod(payload.is_in_billing_retry_period);
    const expirationIntent = parseExpirationIntent(payload.expiration_intent);
    if(autoRenewStatus.kind === ResultKind.Err) {
        return autoRenewStatus
    }
    if(billingRetryPeriod.kind === ResultKind.Err) {
       return billingRetryPeriod
    }
    if(expirationIntent.kind === ResultKind.Err) {
        return expirationIntent
    }
    if(
        (typeof payload.auto_renew_product_id === "string" || typeof payload.auto_renew_product_id === "undefined") &&
        autoRenewStatus.kind === ResultKind.Ok &&
        expirationIntent.kind === ResultKind.Ok &&
        (typeof payload.grace_period_expires_date_ms === "string" || typeof payload.grace_period_expires_date_ms === "undefined") &&
        billingRetryPeriod.kind === ResultKind.Ok &&
        typeof payload.original_transaction_id === "string" &&
        typeof payload.product_id === "string"
    ) {
        return ok({
            auto_renew_product_id: payload.auto_renew_product_id,
            auto_renew_status: autoRenewStatus.value,
            expiration_intent: expirationIntent.value,
            grace_period_expires_date_ms: payload.grace_period_expires_date_ms,
            is_in_billing_retry_period: billingRetryPeriod.value,
            original_transaction_id: payload.original_transaction_id,
            product_id: payload.product_id
        })
    }
    return err("Pending Renewal Info object from Apple cannot be parsed")
}

function parseUnifiedReceipt(payload: unknown):  Result<string, UnifiedReceiptInfo> {
    if(!isObject(payload)) {
        return err("The unified receipt object that Apple gave us isn't an object")
    }
    console.log(`The keys of the unified receipt: ${Object.keys(payload)}`);
    const latestReceiptInfo = parseArray(parseAppleReceiptInfo)(payload.latest_receipt_info)
    const pendingRenewalInfo = parseArray(parsePendingRenewalInfo)(payload.pending_renewal_info)
    if(latestReceiptInfo.kind === ResultKind.Err) {
        return latestReceiptInfo
    }
    if(pendingRenewalInfo.kind === ResultKind.Err) {
        return pendingRenewalInfo
    }
    if(
        typeof payload.environment === "string" &&
        typeof payload.latest_receipt === "string" &&
        typeof payload.status === "number" &&
        latestReceiptInfo.kind === ResultKind.Ok &&
        pendingRenewalInfo.kind === ResultKind.Ok

    ) {
        return ok({
            environment: payload.environment,
            latest_receipt: payload.latest_receipt,
            status: payload.status,
            latest_receipt_info: latestReceiptInfo.value,
            pending_renewal_info: pendingRenewalInfo.value
        })
    }
    return err("Unified Receipt object from Apple cannot be parsed")
}

function parseNotification(payload: unknown): Result<string, StatusUpdateNotification>  {
    if(!isObject(payload)) {
        return err("The notification from Apple didn't have any data we can parse")
    }
    console.log(`The keys of the payload: ${Object.keys(payload)}`);
    const unifiedReceipt = parseUnifiedReceipt(payload.unified_receipt);
    if(unifiedReceipt.kind === ResultKind.Err) {
        return unifiedReceipt
    }
    if(
        typeof payload.environment === "string" &&
        typeof payload.bid === "string" &&
        typeof payload.bvrs === "string" &&
        typeof payload.notification_type === "string" &&
        (typeof payload.original_transaction_id === "string" || typeof payload.original_transaction_id === "undefined") &&
        (typeof payload.cancellation_date === "string" || typeof payload.cancellation_date === "undefined") &&
        (typeof payload.web_order_line_item_id === "string" || typeof payload.web_order_line_item_id === "undefined" ) &&
        typeof payload.auto_renew_status === "string" &&
        (typeof payload.auto_renew_adam_id === "string" || typeof payload.auto_renew_adam_id === "undefined" ) &&
        typeof payload.auto_renew_product_id === "string" &&
        (typeof payload.expiration_intent === "string" || typeof payload.expiration_intent === "undefined")
    ) {
        return ok({
            environment: payload.environment,
            bid: payload.bid,
            bvrs: payload.bvrs,
            notification_type: payload.notification_type,
            original_transaction_id: payload.original_transaction_id,
            cancellation_date: payload.cancellation_date,
            web_order_line_item_id: payload.web_order_line_item_id,
            auto_renew_status: payload.auto_renew_status,
            auto_renew_adam_id: payload.auto_renew_adam_id,
            auto_renew_product_id: payload.auto_renew_product_id,
            expiration_intent: payload.expiration_intent,
            unified_receipt: unifiedReceipt.value
        })
    }
    return err("Notification from Apple cannot be parsed")
}

export function parsePayload(body: Option<string>): Error | StatusUpdateNotification {
    try {
        const notification: unknown = JSON.parse(body ?? "");
        if(isObject(notification)) {
            console.log(`parsePayload environment: ${notification?.environment}`);
        }
        //     if(notification?.environment === "Sandbox") {
        //         console.log(`parsePayload: sandbox body: ${body}`)
        //     } else {
        //         console.log(`parsePayload environment: ${notification?.environment}`);
        //     }
        // }
        const parsedNotification = parseNotification(notification);
        if(parsedNotification.kind === ResultKind.Ok) {
            return parsedNotification.value;
        }
        throw Error(`The payload could not be parsed due to ${parsedNotification.err}`)
    } catch (e) {
        console.log("Error during the parsing of the HTTP Payload body: " + e);
        return e;
    }
}


export function toDynamoEvent(notification: StatusUpdateNotification): SubscriptionEvent {
    const now = new Date();
    const eventType = notification.notification_type;
    const receiptInfo = notification.unified_receipt.latest_receipt_info;
    console.log(`notification is from ${notification.environment}, latest_receipt_info is undefined: ${notification.unified_receipt.latest_receipt_info === undefined}`);
    const platform = fromAppleBundle(notification.bid);
    if (!platform) {
        console.warn(`Unknown bundle id ${notification.bid}`)
    }

    if(receiptInfo.length === 0) {
        console.warn(`No latest_receipt_info has been found, it has returned an empty array`)
    }

    const sortByExpiryDate = receiptInfo.sort((receipt1, receipt2) => {
        return Number.parseInt(receipt2.expires_date_ms) - Number.parseInt(receipt1.expires_date_ms);
    });

    // The Guardian's "free trial" period definition is slightly different from Apple, hence why we test for is_in_intro_offer_period
    const freeTrial = sortByExpiryDate[0].is_trial_period === "true" || sortByExpiryDate[0].is_in_intro_offer_period === "true";

    return new SubscriptionEvent(
        sortByExpiryDate[0].original_transaction_id,
        now.toISOString() + "|" + eventType,
        now.toISOString().substr(0, 10),
        now.toISOString(),
        eventType,
        platform ?? "unknown",
        notification.bid,
        freeTrial,
        null,
        notification,
        dateToSecondTimestamp(thirtyMonths(now))
    );
}

export function toSqsSubReference(event: StatusUpdateNotification): AppleSubscriptionReference {
    const receipt = event.unified_receipt.latest_receipt;
    return {
        receipt: receipt
    }
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    return parseStoreAndSend(
        request,
        parsePayload,
        toDynamoEvent,
        toSqsSubReference,
        () => Promise.resolve(undefined)
    )
}
