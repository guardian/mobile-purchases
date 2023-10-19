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
    web_order_line_item_id?: string,
    quantity: string,
    purchase_date_ms: string,
    original_purchase_date_ms: string,
    expires_date?: string,
    expires_date_ms?: string,
    is_in_intro_offer_period?: string,
    is_trial_period: string,
    item_id?: string,
    app_item_id?: string,
    unique_identifier?: string,
    unique_vendor_identifier?: string,
    bvrs?: string,
    version_external_identifier?: string,
    promotional_offer_id?: string,
    offer_code_ref_name?: string
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

const fieldAllowList = [ "environment", "product_id", "notification_type",
                         "auto_renew_status", "status", "purchase_date" ];

function debugCleanPayload(data: unknown, depth: number = 4, whitelisted: boolean = false): object | string {
    if(isObject(data) && depth > 0) {
        if(Array.isArray(data)) {
            let res = []
            for(let item of data)
                res.push(debugCleanPayload(item, depth - 1))
            return res
        } else {
            let result: Record<string, unknown> = {}
            for(let k in data)
                result[k] = debugCleanPayload(data[k], depth - 1, fieldAllowList.includes(k))
            return result
        }
    } else if(whitelisted) return `${data}`
    else return `<${typeof(data)}>`
}

function debugLogPayload(data: unknown, maxDepth: number = 4) {
    return JSON.stringify(debugCleanPayload(data, maxDepth))
}

function parseAppleReceiptInfo(payload: unknown):  Result<string, AppleReceiptInfo> {
    if(!isObject(payload)) {
        return err("The apple receipt info field that Apple gave us isn't an object")
    }
    if(typeof payload.transaction_id !== "string") return err("missing field: transaction_id")
    if(typeof payload.product_id !== "string") return err("missing field: product_id")
    if(typeof payload.original_transaction_id !== "string") return err("missing field: original_transaction_id")
    if(typeof payload.item_id !== "string" && typeof payload.item_id !== "undefined") return err(`incorrect optional field: item_id ${typeof payload.item_id}`)
    if(typeof payload.app_item_id !== "string" && typeof payload.app_item_id !== "undefined") return err(`incorrect optional field: app_item_id ${typeof(payload.app_item_id)}`)
    if(typeof payload.web_order_line_item_id !== "string" && typeof payload.web_order_line_item_id !== "undefined") return err(`incorrect optional field: web_order_line_item_id ${typeof(payload.web_order_line_item_id)}`)
    if(typeof payload.unique_identifier !== "string" && typeof payload.unique_identifier !== "undefined") return err(`incorrect optional field: unique_identifier ${typeof(payload.unique_identifier)}`)
    if(typeof payload.unique_vendor_identifier !== "string" && typeof payload.unique_vendor_identifier !== "undefined") return err(`incorrect optional field: unique_vendor_identifier ${typeof(payload.unique_vendor_identifier)}`)
    if(typeof payload.quantity !== "string") return err("missing field: quantity")
    if(typeof payload.purchase_date_ms !== "string") return err("missing field: purchase_date_ms")
    if(typeof payload.original_purchase_date_ms !== "string") return err("missing field: original_purchase_date_ms")
    if(typeof payload.expires_date !== "string" && typeof payload.expires_date !== "undefined") return err(`incorrect optional field: expires_date ${typeof(payload.expires_date)}`)
    if(typeof payload.expires_date_ms !== "string" && typeof payload.expires_date_ms !== "undefined") return err(`incorrect optional field: expires_date_ms ${typeof(payload.expires_date_ms)}`)
    if(typeof payload.is_in_intro_offer_period !== "string" && typeof payload.is_in_intro_offer_period !== "undefined") return err(`incorrect optional field: is_in_intro_offer_period ${typeof(payload.is_in_intro_offer_period)}`)
    if(typeof payload.is_trial_period !== "string") return err("missing field: is_trial_period")
    if(typeof payload.bvrs !== "string" && typeof payload.bvrs !== "undefined") return err(`incorrect optional field: bvrs ${typeof(payload.bvrs)}`)
    if(typeof payload.version_external_identifier !== "string" && typeof payload.version_external_identifier !== "undefined") return err(`incorrect optional field: version_external_identifier ${typeof(payload.version_external_identifier)}`)
    if(typeof payload.promotional_offer_id !== "string" && typeof payload.promotional_offer_id !== "undefined") return err(`incorrect optional field: promotional_offer_id ${typeof(payload.promotional_offer_id)}`)
    if(typeof payload.offer_code_ref_name !== "string" && typeof payload.offer_code_ref_name !== "undefined") return err(`incorrect optional field: offer_code_ref_name ${typeof(payload.offer_code_ref_name)}`)

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
        version_external_identifier: payload.version_external_identifier,
        promotional_offer_id: payload.promotional_offer_id,
        offer_code_ref_name: payload.offer_code_ref_name
    })
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
        typeof payload.product_id === "string" &&
        (typeof payload.price_consent_status === "string" || typeof payload.price_consent_status === "undefined") &&
        (typeof payload.price_increase_status === "string" || typeof payload.price_increase_status === "undefined")
    ) {
        return ok({
            auto_renew_product_id: payload.auto_renew_product_id,
            auto_renew_status: autoRenewStatus.value,
            expiration_intent: expirationIntent.value,
            grace_period_expires_date_ms: payload.grace_period_expires_date_ms,
            is_in_billing_retry_period: billingRetryPeriod.value,
            original_transaction_id: payload.original_transaction_id,
            product_id: payload.product_id,
            price_consent_status: payload.price_consent_status,
            price_increase_status: payload.price_increase_status
        })
    }
    return err("Pending Renewal Info object from Apple cannot be parsed")
}

function parseUnifiedReceipt(payload: unknown):  Result<string, UnifiedReceiptInfo> {
    if(!isObject(payload)) {
        return err("The unified receipt object that Apple gave us isn't an object")
    }
    const latestReceiptInfo = parseArray(parseAppleReceiptInfo)(payload.latest_receipt_info)
    const pendingRenewalInfo = parseArray(parsePendingRenewalInfo)(payload.pending_renewal_info)
    if(latestReceiptInfo.kind === ResultKind.Err) {
        return latestReceiptInfo
    }
    if(pendingRenewalInfo.kind === ResultKind.Err) {
        return pendingRenewalInfo
    }

    if(typeof payload.environment !== "string") return err("parseUnifiedReceipt: missing field: environment")
    if(typeof payload.latest_receipt !== "string") return err("parseUnifiedReceipt: missing field: latest_receipt")
    if(typeof payload.status !== "number") return err("parseUnifiedReceipt: missing field: status")

    return ok({
        environment: payload.environment,
        latest_receipt: payload.latest_receipt,
        status: payload.status,
        latest_receipt_info: latestReceiptInfo.value.slice(0, 20),
        pending_renewal_info: pendingRenewalInfo.value
    })
}

function parseNotification(payload: unknown): Result<string, StatusUpdateNotification>  {
    if(!isObject(payload)) {
        return err("The notification from Apple didn't have any data we can parse")
    }

    const unifiedReceipt = parseUnifiedReceipt(payload.unified_receipt);
    if(unifiedReceipt.kind === ResultKind.Err) {
        return unifiedReceipt
    }
    if(
        typeof payload.environment === "string" &&
        typeof payload.bid === "string" &&
        typeof payload.bvrs === "string" &&
        typeof payload.notification_type === "string" &&
        (typeof payload.original_transaction_id === "string" || typeof payload.original_transaction_id === "undefined" || typeof payload.original_transaction_id === "number") &&
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
            original_transaction_id: typeof payload.original_transaction_id === "number" ? payload.original_transaction_id.toString() : payload.original_transaction_id,
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
        const parsedNotification = parseNotification(notification);
        if(parsedNotification.kind === ResultKind.Ok) {
            console.log(`(ec0a5f83) ${body}`);
            return parsedNotification.value;
        }
        console.log(`debugLogPayload (parse error: ${parsedNotification.err}): ${debugLogPayload(notification)}`)
        throw Error(`The payload could not be parsed due to ${parsedNotification.err}`)
    } catch (e) {
        console.log("Error during the parsing of the HTTP Payload body: " + e);
        return e as Error;
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
        return Number.parseInt(receipt2.purchase_date_ms) - Number.parseInt(receipt1.purchase_date_ms);
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
    console.log(`[4ba45228] request.path ${request.path}`);
    console.log(`[4ba45228] request.pathParameters ${request.pathParameters}`);
    console.log(`[4ba45228] request.queryStringParameters ${request.queryStringParameters}`);
    console.log(`[4ba45228] request.body ${request.body}`);
    return parseStoreAndSend(
        request,
        parsePayload,
        toDynamoEvent,
        toSqsSubReference,
        () => Promise.resolve(undefined)
    )
}
