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
    item_id: string,
    app_item_id: string,
    web_order_line_item_id: string,
    unique_identifier: string,
    unique_vendor_identifier: string,
    quantity: string,
    purchase_date_ms: string,
    original_purchase_date_ms: string,
    expires_date: string,
    expires_date_ms: string,
    is_in_intro_offer_period: string,
    is_trial_period: string,
    bvrs: string,
    version_external_identifier: string
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
    original_transaction_id: string,
    cancellation_date: string,
    web_order_line_item_id: string,
    unified_receipt: UnifiedReceiptInfo,
    auto_renew_status: boolean,
    auto_renew_adam_id: string,
    auto_renew_product_id: string,
    expiration_intent: string
}

const isObject = (a: unknown): a is Record<string, unknown> =>
    typeof a === 'object' && a !== null;

const parseArray = <A>(parseA: (a: unknown) => Option<A>) => (array: unknown): Option<A[]> => {
    const f = (acc: A[], remainder: unknown[]): Option<A[]> => {
        if (remainder.length === 0) {
            return some(acc);
        }

        const [ item, ...tail ] = remainder;
        const parsed = parseA(item);

        if (parsed.kind === OptionKind.Some) {
            return f([ ...acc, parsed.value ], tail);
        }

        return none;
    }

    if (Array.isArray(array)) {
        return f([], array);
    }

    return none;
}

function parseAppleReceiptInfo(payload: unknown):  Result<string, AppleReceiptInfo> {
    if(!isObject(payload)) {
        return err("The apple receipt info field that Apple gave us isn't an object")
    }
    if(
    )
}

function parseUnifiedReceipt(payload: unknown):  Result<string, UnifiedReceiptInfo> {
    if(!isObject(payload)) {
        return err("The unified receipt field that Apple gave us isn't an object")
    }
    if(
        typeof payload.environment === "string" &&
        typeof payload.latest_receipt === "string" &&
        typeof payload.status === "number"
    ) {
        return ok({
            environment: payload.environment,
            latest_receipt: payload.latest_receipt,
            status: payload.status
        })
    }
}

function parseNotification(payload: unknown): Result<string, StatusUpdateNotification>  {
    if(!isObject(payload)) {
        return err("The notification from Apple didn't have any data we can parse")
    }
    const unifiedReceipt = parseUnifiedReceipt(payload.unified_receipt)
    if(
        typeof payload.environment === "string" &&
        typeof payload.bid === "string" &&
        typeof payload.bvrs === "string" &&
        typeof payload.notification_type === "string" &&
        typeof payload.original_transaction_id === "string" &&
        typeof payload.cancellation_date === "string" &&
        typeof payload.web_order_line_item_id === "string" &&
        typeof payload.auto_renew_status === "boolean" &&
        typeof payload.auto_renew_adam_id === "string" &&
        typeof payload.auto_renew_product_id === "string" &&
        typeof payload.expiration_intent === "string" &&
        unifiedReceipt.kind === ResultKind.Ok
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
}

export function parsePayload(body: Option<string>): Error | StatusUpdateNotification {
    try {
        let notification: unknown = JSON.parse(body ?? "");
        delete notification.password; // no need to keep that in memory
        return notification;
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
