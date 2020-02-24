import 'source-map-support/register'
import {parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import {dateToSecondTimestamp, thirtyMonths} from "../utils/dates";
import {GoogleSubscriptionReference} from "../models/subscriptionReference";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Option} from "../utils/option";
import {fromGooglePackageName} from "../services/appToPlatform";
import {fetchGoogleSubscription, GOOGLE_PAYMENT_STATE} from "../services/google-play";

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

interface MetaData {
    freeTrial: boolean
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

async function fetchMetadata(notification: DeveloperNotification): Promise<MetaData | undefined> {
    try {
        const subscription = await fetchGoogleSubscription(
            notification.subscriptionNotification.subscriptionId,
            notification.subscriptionNotification.purchaseToken,
            notification.packageName
        );
        return {
            freeTrial : subscription?.paymentState === GOOGLE_PAYMENT_STATE.FREE_TRIAL
        }
    } catch (exception) {
        // here we really don't want to stop the processing of that event if we can't fetch metadata,
        // as storing the event in the dynamo DB, and posting to the SQS queue are higher priority.
        // So even if something goes horribly wrong, we'll cary on the processing
        console.error(`Unable to fetch the subscription associated with the event`, exception);
        return undefined;
    }
}

export function toDynamoEvent(notification: DeveloperNotification, metaData?: MetaData): SubscriptionEvent {
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
        metaData?.freeTrial,
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
        toSqsSubReference,
        fetchMetadata
    )
}