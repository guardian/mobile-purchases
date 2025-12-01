import 'source-map-support/register';
import { z } from 'zod';
import { SubscriptionEvent } from '../models/subscriptionEvent';
import type { GoogleSubscriptionReference } from '../models/subscriptionReference';
import { googlePackageNameToPlatform } from '../services/appToPlatform';
import { build_extra_string } from '../services/google-subscription-extra';
import { Stage } from '../utils/appIdentity';
import { fetchGoogleSubscription, GOOGLE_PAYMENT_STATE } from '../services/google-play';
import { dateToSecondTimestamp, optionalMsToDate, thirtyMonths } from '../utils/dates';
import type { Option } from '../utils/option';
import { Ignorable } from './ignorable';

const DeveloperNotificationBaseSchema = z.object({
    version: z.string(),
    packageName: z.string(),
    eventTimeMillis: z.string(),
});

const SubscriptionNotificationSchema = DeveloperNotificationBaseSchema.extend({
    subscriptionNotification: z.object({
        version: z.string(),
        notificationType: z.number(),
        purchaseToken: z.string(),
        subscriptionId: z.string(),
    }),
});
export type SubscriptionNotification = z.infer<typeof SubscriptionNotificationSchema>;

const VoidedPurchaseNotificationSchema = DeveloperNotificationBaseSchema.extend({
    voidedPurchaseNotification: z.object({
        purchaseToken: z.string(),
        orderId: z.string(),
        productType: z.number(),
        refundType: z.number(),
    }),
});
export type VoidedPurchaseNotification = z.infer<typeof VoidedPurchaseNotificationSchema>;

// Zod doesn't seem to support both extending a base schema with a refinement
// and extending so I need to apply the refinement here.
const DeveloperNotificationSchema = z
    .union([SubscriptionNotificationSchema, VoidedPurchaseNotificationSchema])
    .refine(
        (data) => optionalMsToDate(data.eventTimeMillis) !== null,
        (data) => ({
            message: `Unable to parse the eventTimeMillis field ${data.eventTimeMillis}`,
        }),
    );
export type DeveloperNotification = z.infer<typeof DeveloperNotificationSchema>;

export interface GoogleSubscriptionMetaData {
    freeTrial: boolean;
}

function isSubscriptionNotification(
    notification: DeveloperNotification,
): notification is SubscriptionNotification {
    return (notification as SubscriptionNotification).subscriptionNotification !== undefined;
}

export function parsePayload(body: Option<string>): Error | SubscriptionNotification | Ignorable {
    try {
        const rawNotification = Buffer.from(JSON.parse(body ?? '').message.data, 'base64');
        const parseResult = DeveloperNotificationSchema.safeParse(
            JSON.parse(rawNotification.toString()),
        );
        if (!parseResult.success) {
            return new Error(`HTTP Payload body parse error: ${parseResult.error}`);
        }

        const data = parseResult.data;
        if (isSubscriptionNotification(data)) {
            return data;
        }

        return new Ignorable(
            `Notification is not a subscription notification. Notification was: ${JSON.stringify(
                data,
            )}`,
        );
    } catch (e) {
        console.log('Error during the parsing of the HTTP Payload body: ' + e);
        return e as Error;
    }
}

export const GOOGLE_SUBS_EVENT_TYPE: Record<number, string> = {
    1: 'SUBSCRIPTION_RECOVERED',
    2: 'SUBSCRIPTION_RENEWED',
    3: 'SUBSCRIPTION_CANCELED',
    4: 'SUBSCRIPTION_PURCHASED',
    5: 'SUBSCRIPTION_ON_HOLD',
    6: 'SUBSCRIPTION_IN_GRACE_PERIOD',
    7: 'SUBSCRIPTION_RESTARTED',
    8: 'SUBSCRIPTION_PRICE_CHANGE_CONFIRMED',
    9: 'SUBSCRIPTION_DEFERRED',
    12: 'SUBSCRIPTION_REVOKED',
    13: 'SUBSCRIPTION_EXPIRED',
};

export async function fetchMetadata(
    notification: SubscriptionNotification,
): Promise<GoogleSubscriptionMetaData | undefined> {
    try {
        const subscription = await fetchGoogleSubscription(
            notification.subscriptionNotification.subscriptionId,
            notification.subscriptionNotification.purchaseToken,
            notification.packageName,
        );
        return {
            freeTrial: subscription?.paymentState === GOOGLE_PAYMENT_STATE.FREE_TRIAL,
        };
    } catch (exception) {
        // here we really don't want to stop the processing of that event if we can't fetch metadata,
        // as storing the event in the dynamo DB, and posting to the SQS queue are higher priority.
        // So even if something goes horribly wrong, we'll cary on the processing
        console.error(`Unable to fetch the subscription associated with the event`, exception);

        // Log the notification 5% of the time for debugging - I don't want this to be too noisy
        if (Math.random() < 0.05) {
            console.error('Notification was: ', notification);
        }

        return undefined;
    }
}

export async function toDynamoEvent_google_async(
    notification: SubscriptionNotification,
    shouldBuildExtra: boolean,
    metaData?: GoogleSubscriptionMetaData,
): Promise<SubscriptionEvent> {
    const eventTime = optionalMsToDate(notification.eventTimeMillis);
    if (!eventTime) {
        // this is tested while parsing the payload in order to return HTTP 400 early.
        // Therefore we should never reach this part of the code
        throw new Error("eventTimeMillis can't be null");
    }
    const eventTimestamp = eventTime.toISOString();
    const date = eventTimestamp.substring(0, 10);
    const eventType = notification.subscriptionNotification.notificationType;
    const eventTypeString = GOOGLE_SUBS_EVENT_TYPE[eventType] ?? eventType.toString();
    const platform = googlePackageNameToPlatform(notification.packageName)?.toString();
    if (!platform) {
        console.warn(`Unknown package name ${notification.packageName}`);
    }

    let extra = '';
    console.log(`[8753e006] google pubsub, shouldBuildExtra: ${shouldBuildExtra}`);
    if (shouldBuildExtra) {
        const packageName = notification.packageName;
        const purchaseToken = notification.subscriptionNotification.purchaseToken;
        const productId = notification.subscriptionNotification.subscriptionId; // [1]
        extra = (await build_extra_string(Stage, packageName, purchaseToken, productId)) ?? '';
        console.log(`[a7beb002] ${extra}`);

        // [1]
        // What is called `subscriptionId` in the notification is actually a productId.
        // An example of notification is
        // {
        //     "packageName": "uk.co.guardian.feast",
        //     "purchaseToken": "Example-kokmikjooafaEUsuLAO3RKjfwtmyQ",
        //     "subscriptionId": "uk.co.guardian.feast.access"
        //}
        // See docs/google-identifiers.md for details
    }

    const subscription = new SubscriptionEvent(
        notification.subscriptionNotification.purchaseToken, // subscriptionId
        eventTimestamp + '|' + eventTypeString, // timestampAndType
        date, // date
        eventTimestamp, // timestamp
        eventTypeString, // eventType
        platform ?? 'unknown', // platform
        notification.packageName, // appId
        metaData?.freeTrial, // freeTrial
        notification, // googlePayload
        null, // applePayload
        dateToSecondTimestamp(thirtyMonths(eventTime)), // ttl
        null, // promotional_offer_id ; string | null ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        null, // promotional_offer_name ; string | null ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        undefined, // product_id ; any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        undefined, // purchase_date_ms ; any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        undefined, // expires_date_ms ; any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
        extra, // extra
    );

    return Promise.resolve(subscription);
}

export function toSqsSubReference(event: SubscriptionNotification): GoogleSubscriptionReference {
    return {
        packageName: event.packageName,
        purchaseToken: event.subscriptionNotification.purchaseToken,
        subscriptionId: event.subscriptionNotification.subscriptionId,
    };
}
