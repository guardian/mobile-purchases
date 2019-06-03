import {HTTPRequest, HTTPResponse} from "../models/apiGatewayHttp";
import {ONE_YEAR_IN_SECONDS, parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";

export interface StatusUpdateNotification {
    environment: string,
    notification_type: string,
    password?: string,
    original_transaction_id: string,
    cancellation_date: string,
    web_order_line_item_id: string,
    latest_receipt: string,
    latest_receipt_info: any,
    latest_expired_receipt: string,
    latest_expired_receipt_info: any,
    auto_renew_status: boolean,
    auto_renew_adam_id: string,
    auto_renew_product_id: string,
    expiration_intent: string
}

export function parsePayload(body?: string): Error | StatusUpdateNotification {
    console.log(body);
    try {
        let notification = JSON.parse(body || "") as StatusUpdateNotification;
        delete notification.password;
        return notification;
    } catch (e) {
        console.log("Error during the parsing of the HTTP Payload body: " + e);
        return e;
    }
}


export function toDynamoSubscriptionEvent(notification: StatusUpdateNotification): SubscriptionEvent {
    const now = new Date();
    const eventType = notification.notification_type;
    return new SubscriptionEvent(
        notification.original_transaction_id,
        now.toISOString() + "|" + eventType,
        now.toISOString(),
        eventType,
        "ios",
        null,
        notification,
        Math.ceil((now.getTime() / 1000) + 7 * ONE_YEAR_IN_SECONDS)
    );
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    return parseStoreAndSend(
        request,
        parsePayload,
        toDynamoSubscriptionEvent
    )
}