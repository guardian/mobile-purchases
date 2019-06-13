import 'source-map-support/register'
import {HTTPRequest, HTTPResponse} from "../models/apiGatewayHttp";
import {ONE_YEAR_IN_SECONDS, parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";

interface DeveloperNotification {
    version: string,
    packageName: string,
    eventTimeMillis: string,
    subscriptionNotification: SubscriptionNotification
}

interface SubscriptionNotification {
    version: string,
    notificationType: number,
    purchaseToken: string,
    subscriptionId: string
}

interface SqsEvent {
    packageName: string,
    purchaseToken: string,
    subscriptionId: string
}

export function parsePayload(body?: string): Error | DeveloperNotification {
    try {
        let rawNotification = Buffer.from(JSON.parse(body || "").message.data, 'base64');
        return JSON.parse(rawNotification.toString()) as DeveloperNotification;
    } catch (e) {
        console.log("Error during the parsing of the HTTP Payload body: " + e);
        return e;
    }
}

const GOOGLE_SUBS_EVENT_TYPE: {[_: number]: string} = {
    1: "SUBSCRIPTION_RECOVERED",
    2: "SUBSCRIPTION_RENEWED",
    3: "SUBSCRIPTION_CANCELED",
    4: "SUBSCRIPTION_PURCHASED",
    5: "SUBSCRIPTION_ON_HOLD",
    6: "SUBSCRIPTION_IN_GRACE_PERIOD",
    7: "SUBSCRIPTION_RESTARTED",
    8: "SUBSCRIPTION_PRICE_CHANGE_CONFIRMED",
    9: "SUBSCRIPTION_DEFERRED",
    12: "SUBSCRIPTION_REVOKED",
    13: "SUBSCRIPTION_EXPIRED"
};

export function toDynamoEvent(notification: DeveloperNotification): SubscriptionEvent {
    const eventTimestamp = new Date(Number.parseInt(notification.eventTimeMillis)).toISOString();
    const eventType = notification.subscriptionNotification.notificationType;
    const eventTypeString = GOOGLE_SUBS_EVENT_TYPE[eventType] || eventType.toString();
    return new SubscriptionEvent(
        notification.subscriptionNotification.purchaseToken,
        eventTimestamp + "|" + eventTypeString,
        eventTimestamp,
        eventTypeString,
        "android",
        notification.packageName,
        notification,
        null,
        Math.ceil((Number.parseInt(notification.eventTimeMillis) / 1000) + 7 * ONE_YEAR_IN_SECONDS)
    );
}

export function toSqsEvent(event: DeveloperNotification): SqsEvent {
    return {
        packageName: event.packageName,
        purchaseToken: event.subscriptionNotification.purchaseToken,
        subscriptionId: event.subscriptionNotification.subscriptionId
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