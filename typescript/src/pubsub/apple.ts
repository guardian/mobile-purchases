import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { SubscriptionEvent } from '../models/subscriptionEvent';
import type { AppleSubscriptionReference } from '../models/subscriptionReference';
import type { AppleStoreKitSubscriptionData } from '../services/api-storekit';
import { transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra } from '../services/api-storekit';
import { appleBundleToPlatform } from '../services/appToPlatform';
import { Stage } from '../utils/appIdentity';
import { dateToSecondTimestamp, thirtyMonths } from '../utils/dates';
import type { StatusUpdateNotification } from './apple-common';
import { parsePayload } from './apple-common';
import { parseStoreAndSend_async } from './pubsub';

export async function toDynamoEvent_apple_async(
    notification: StatusUpdateNotification,
    useStoreKitForExtra: boolean,
): Promise<SubscriptionEvent> {
    const now = new Date();
    const eventType = notification.notification_type;
    const receiptInfo = notification.unified_receipt.latest_receipt_info;
    console.log(
        `notification is from ${notification.environment}, latest_receipt_info is undefined: ${
            notification.unified_receipt.latest_receipt_info === undefined
        }`,
    );
    const platform = appleBundleToPlatform(notification.bid);
    if (!platform) {
        console.warn(`Unknown bundle id ${notification.bid}`);
    }

    if (receiptInfo.length === 0) {
        console.warn(`No latest_receipt_info has been found, it has returned an empty array`);
    }

    const receiptsInOrder = receiptInfo.sort((receipt1, receipt2) => {
        return (
            Number.parseInt(receipt2.purchase_date_ms) - Number.parseInt(receipt1.purchase_date_ms)
        );
    });

    // The Guardian's "free trial" period definition is slightly different from Apple, hence why we test for is_in_intro_offer_period
    const freeTrial =
        receiptsInOrder[0].is_trial_period === 'true' ||
        receiptsInOrder[0].is_in_intro_offer_period === 'true';

    // Preventin:g ERROR: Unable to process event[object Object] ValidationException: Item size has exceeded the maximum allowed size
    // Which for some reasons has only been observed in CODE
    if (Stage === 'CODE' && notification.unified_receipt.latest_receipt.length > 100 * 1024) {
        // Bigger than 100Kb
        notification.unified_receipt.latest_receipt = '';
    }

    var extra = '';
    console.log(`[f0736bbc] useStoreKitForExtra: ${useStoreKitForExtra}`);
    if (useStoreKitForExtra) {
        // Defining the two variables we need to call for the extra data
        const original_transaction_id = receiptsInOrder[0].original_transaction_id;
        const appBundleId = notification.bid;
        const extra_object: AppleStoreKitSubscriptionData | undefined =
            await transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra(
                appBundleId,
                original_transaction_id,
            );
        if (extra_object !== undefined) {
            extra = JSON.stringify(extra_object);
            console.log(`[8250388c] original_transaction_id: ${original_transaction_id}`);
            console.log(`[6081748f] appBundleId: ${appBundleId}`);
            console.log(`[ffa2b2a7] extra: ${extra}`);
        }
    }

    const subscription = new SubscriptionEvent(
        receiptsInOrder[0].original_transaction_id, // subscriptionId
        now.toISOString() + '|' + eventType, // timestampAndType
        now.toISOString().substr(0, 10), // date
        now.toISOString(), // timestamp
        eventType, // eventType
        platform ?? 'unknown', // platform
        notification.bid, // appId
        freeTrial, // freeTrial
        null, // googlePayload
        notification, // applePayload
        dateToSecondTimestamp(thirtyMonths(now)), // ttl
        notification.promotional_offer_id, // promotional_offer_id ; SubscriptionEvent.promotional_offer_id
        notification.promotional_offer_name, // promotional_offer_name ; SubscriptionEvent.promotional_offer_name
        notification.product_id, // product_id ; SubscriptionEvent.product_id
        notification.purchase_date_ms, // purchase_date_ms ; SubscriptionEvent.purchase_date_ms
        notification.expires_date_ms, // expires_date_ms ; SubscriptionEvent.expires_date_ms
        extra,
    );

    return Promise.resolve(subscription);
}

export function toSqsSubReference(event: StatusUpdateNotification): AppleSubscriptionReference {
    const receipt = event.unified_receipt.latest_receipt;

    // SQS has a limitation by which the message body needs to be less than 256Kb
    // source: https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/quotas-messages.html#
    // We are building an object which is going to be JSON serialised and then used as the body of such a SQS message
    // It appears that Apple sometimes sends events with latest_receipt that is too large

    // Bigger than 200Kb and only ever observed in CODE
    if (Stage === 'CODE' && receipt.length > 200 * 2024) {
        return {
            receipt: '',
        };
    }

    return {
        receipt: receipt,
    };
}

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
    console.log(`[23ad7cb3] ${JSON.stringify(request)}`);
    return parseStoreAndSend_async(
        request,
        parsePayload,
        (notification: StatusUpdateNotification) => toDynamoEvent_apple_async(notification, true),
        toSqsSubReference,
        () => Promise.resolve(undefined),
    );
}
