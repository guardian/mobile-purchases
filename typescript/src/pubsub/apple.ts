import 'source-map-support/register'
import {parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {AppleSubscriptionReference} from "../models/subscriptionReference";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Option} from "../utils/option";
import {fromAppleBundle} from "../services/appToPlatform";

// this is the definition of a receipt as received by the server to server notification system.
// Not to be confused with apple's receipt validation receipt info (although they do look similar, they are different)
// See https://developer.apple.com/documentation/appstoreservernotifications/responsebody
export interface AppleReceiptInfo {
    transaction_id: string,
    bid: string,
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
    is_in_intro_offer_period: string,
    is_trial_period: string,
    bvrs: string,
    version_external_identifier: string
}

export interface StatusUpdateNotification {
    environment: string,
    notification_type: string,
    password?: string,
    original_transaction_id: string,
    cancellation_date: string,
    web_order_line_item_id: string,
    latest_receipt: string,
    latest_receipt_info: AppleReceiptInfo,
    latest_expired_receipt: string,
    latest_expired_receipt_info: AppleReceiptInfo,
    auto_renew_status: boolean,
    auto_renew_adam_id: string,
    auto_renew_product_id: string,
    expiration_intent: string
}

export function parsePayload(body: Option<string>): Error | StatusUpdateNotification {
    try {
        let notification = JSON.parse(body ?? "") as StatusUpdateNotification;
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

    const receiptInfo = notification.latest_receipt_info ?? notification.latest_expired_receipt_info;
    console.log(`latest_receipt_info is undefined: ${notification.latest_receipt_info === undefined}, latest_expired_receipt_info is undefined: ${notification.latest_expired_receipt_info === undefined}`);
    const platform = fromAppleBundle(receiptInfo.bid);
    if (!platform) {
        console.warn(`Unknown bundle id ${receiptInfo.bid}`)
    }

    // The Guardian's "free trial" period definition is slightly different from Apple, hence why we test for is_in_intro_offer_period
    const freeTrial = receiptInfo.is_trial_period === "true" || receiptInfo.is_in_intro_offer_period === "true";

    return new SubscriptionEvent(
        receiptInfo.original_transaction_id,
        now.toISOString() + "|" + eventType,
        now.toISOString().substr(0, 10),
        now.toISOString(),
        eventType,
        platform ?? "unknown",
        receiptInfo.bid,
        freeTrial,
        null,
        notification,
        dateToSecondTimestamp(thirtyMonths(now))
    );
}

export function toSqsSubReference(event: StatusUpdateNotification): AppleSubscriptionReference {
    const receipt = event.latest_receipt ?? event.latest_expired_receipt;
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
