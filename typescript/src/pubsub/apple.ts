import 'source-map-support/register'
import {ONE_YEAR_IN_SECONDS, parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import {AppleReceiptInfo} from "../models/appleReceiptInfo";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {AppleSubscriptionReference} from "../models/subscriptionReference";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Option} from "../utils/option";

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
        let notification = JSON.parse(body || "") as StatusUpdateNotification;
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

    const receiptInfo = notification.latest_receipt_info || notification.latest_expired_receipt_info;

    return new SubscriptionEvent(
        receiptInfo.transaction_id,
        now.toISOString() + "|" + eventType,
        now.toISOString().substr(0, 10),
        now.toISOString(),
        eventType,
        "ios",
        receiptInfo.bid,
        null,
        notification,
        dateToSecondTimestamp(thirtyMonths(now))
    );
}

export function toSqsSubReference(event: StatusUpdateNotification): AppleSubscriptionReference {
    const receipt = event.latest_receipt || event.latest_expired_receipt;
    return {
        receipt: receipt
    }
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    return parseStoreAndSend(
        request,
        parsePayload,
        toDynamoEvent,
        toSqsSubReference
    )
}