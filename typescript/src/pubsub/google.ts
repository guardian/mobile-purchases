import 'source-map-support/register'
import {ONE_YEAR_IN_SECONDS, parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {GoogleSubscriptionReference} from "../models/subscriptionReference";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Option} from "../utils/option";
import {fromGooglePackageName} from "../services/appToPlatform";

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


export function parsePayload(body: Option<string>): Error | DeveloperNotification {
    try {
        let rawNotification = Buffer.from(JSON.parse(body ?? "").message.data, 'base64');
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
    const eventDate = new Date(Number.parseInt(notification.eventTimeMillis));
    const eventTimestamp = eventDate.toISOString();
    const date = eventTimestamp.substr(0, 10);
    const eventType = notification.subscriptionNotification.notificationType;
    const eventTypeString = GOOGLE_SUBS_EVENT_TYPE[eventType] ?? eventType.toString();
    const platform = fromGooglePackageName(notification.packageName)?.toString();
    if (!platform) {
        console.warn(`Unknown package name ${notification.packageName}`)
    }
    return new SubscriptionEvent(
        notification.subscriptionNotification.purchaseToken,
        eventTimestamp + "|" + eventTypeString,
        date,
        eventTimestamp,
        eventTypeString,
        platform ?? "unknown",
        notification.packageName,
        notification,
        null,
        dateToSecondTimestamp(thirtyMonths(eventDate))
    );
}

export function toSqsSubReference(event: DeveloperNotification): GoogleSubscriptionReference {
    return {
        packageName: event.packageName,
        purchaseToken: event.subscriptionNotification.purchaseToken,
        subscriptionId: event.subscriptionNotification.subscriptionId
    }
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    return parseStoreAndSend(
        request,
        parsePayload,
        toDynamoEvent,
        toSqsSubReference
    )
}