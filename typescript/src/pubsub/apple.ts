import 'source-map-support/register'
import {HTTPRequest, HTTPResponse} from "../models/apiGatewayHttp";
import {ONE_YEAR_IN_SECONDS, parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import {AppleReceiptInfo} from "../models/appleReceiptInfo";

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

export interface SqsEvent {
    transactionId: string,
    receipt: string,
    cancellationDate: string,
    startDate: string,
    endDate: string,
    autoRenewing: boolean,
    appleBody: string
}

export function parsePayload(body?: string): Error | StatusUpdateNotification {
    try {
        let notification = JSON.parse(body || "") as StatusUpdateNotification;
        delete notification.password;
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
        now.toISOString(),
        eventType,
        "ios",
        receiptInfo.bid,
        null,
        notification,
        Math.ceil((now.getTime() / 1000) + 7 * ONE_YEAR_IN_SECONDS)
    );
}

export function toSqsEvent(event: StatusUpdateNotification): SqsEvent {
    const receiptInfo = event.latest_receipt_info || event.latest_expired_receipt_info;
    const receipt = event.latest_receipt || event.latest_expired_receipt;
    return {
        transactionId: receiptInfo.transaction_id,
        receipt: receipt,
        cancellationDate: event.cancellation_date,
        startDate: receiptInfo.purchase_date_ms,
        endDate: receiptInfo.expires_date,
        autoRenewing: event.auto_renew_status,
        appleBody: JSON.stringify(event)
    }
}

export async function handler(request: HTTPRequest): Promise<HTTPResponse> {
    return parseStoreAndSend(
        request,
        parsePayload,
        toDynamoEvent,
        toSqsEvent
    )
}