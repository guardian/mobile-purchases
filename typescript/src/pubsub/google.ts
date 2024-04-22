import 'source-map-support/register'
import {parseStoreAndSend} from "./pubsub";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import {dateToSecondTimestamp, optionalMsToDate, thirtyMonths} from "../utils/dates";
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
        const rawNotification = Buffer.from(JSON.parse(body ?? "").message.data, 'base64');
        const parsedNotification = JSON.parse(rawNotification.toString()) as DeveloperNotification;
        const eventDate = optionalMsToDate(parsedNotification.eventTimeMillis);
        if (eventDate === null) {
            return new Error(`Unable to parse the eventTimeMillis field ${parsedNotification.eventTimeMillis}`)
        }
        return parsedNotification;
    } catch (e) {
        console.log("Error during the parsing of the HTTP Payload body: " + e);
        return e as Error;
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

        // Log the notification 5% of the time for debugging - I don't want this to be too noisy
        if (Math.random() < 0.05) {
            console.error("Notification was: ", notification);
        }

        return undefined;
    }
}

export function toDynamoEvent(notification: DeveloperNotification, metaData?: MetaData): SubscriptionEvent {
    const eventTime = optionalMsToDate(notification.eventTimeMillis);
    if (!eventTime) {
        // this is tested while parsing the payload in order to return HTTP 400 early.
        // Therefore we should never reach this part of the code
        throw new Error("eventTimeMillis can't be null")
    }
    const eventTimestamp = eventTime.toISOString();
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
        dateToSecondTimestamp(thirtyMonths(eventTime)),
        null,      // string | null ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        null,      // string | null ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        undefined, // any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        undefined, // any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        undefined  // any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
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
