import 'source-map-support/register';
import { z } from 'zod';
import { SubscriptionEvent } from '../models/subscriptionEvent';
import type { GoogleSubscriptionReference } from '../models/subscriptionReference';
import { googlePackageNameToPlatform } from '../services/appToPlatform';
import {
  fetchGoogleSubscription,
  GOOGLE_PAYMENT_STATE,
} from '../services/google-play';
import {
  dateToSecondTimestamp,
  optionalMsToDate,
  thirtyMonths,
} from '../utils/dates';
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
export type SubscriptionNotification = z.infer<
  typeof SubscriptionNotificationSchema
>;

const VoidedPurchaseNotificationSchema = DeveloperNotificationBaseSchema.extend(
  {
    voidedPurchaseNotification: z.object({
      purchaseToken: z.string(),
      orderId: z.string(),
      productType: z.number(),
      refundType: z.number(),
    }),
  },
);
export type VoidedPurchaseNotification = z.infer<
  typeof VoidedPurchaseNotificationSchema
>;

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
  return (
    (notification as SubscriptionNotification).subscriptionNotification !==
    undefined
  );
}

export function parsePayload(
  body: Option<string>,
): Error | SubscriptionNotification | Ignorable {
  try {
    const rawNotification = Buffer.from(
      JSON.parse(body ?? '').message.data,
      'base64',
    );
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
    console.error(
      `Unable to fetch the subscription associated with the event`,
      exception,
    );

    // Log the notification 5% of the time for debugging - I don't want this to be too noisy
    if (Math.random() < 0.05) {
      console.error('Notification was: ', notification);
    }

    return undefined;
  }
}

export function toDynamoEvent(
  notification: SubscriptionNotification,
  metaData?: GoogleSubscriptionMetaData,
): SubscriptionEvent {
  const eventTime = optionalMsToDate(notification.eventTimeMillis);
  if (!eventTime) {
    // this is tested while parsing the payload in order to return HTTP 400 early.
    // Therefore we should never reach this part of the code
    throw new Error("eventTimeMillis can't be null");
  }
  const eventTimestamp = eventTime.toISOString();
  const date = eventTimestamp.substring(0, 10);
  const eventType = notification.subscriptionNotification.notificationType;
  const eventTypeString =
    GOOGLE_SUBS_EVENT_TYPE[eventType] ?? eventType.toString();
  const platform = googlePackageNameToPlatform(
    notification.packageName,
  )?.toString();
  if (!platform) {
    console.warn(`Unknown package name ${notification.packageName}`);
  }

  return new SubscriptionEvent(
    notification.subscriptionNotification.purchaseToken,
    eventTimestamp + '|' + eventTypeString,
    date,
    eventTimestamp,
    eventTypeString,
    platform ?? 'unknown',
    notification.packageName,
    metaData?.freeTrial,
    notification,
    null,
    dateToSecondTimestamp(thirtyMonths(eventTime)),
    null, // string | null ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
    null, // string | null ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
    undefined, // any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
    undefined, // any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
    undefined, // any ; Introduced during the Apple extension of SubscriptionEvent [2023-11-03]
  );
}

export function toSqsSubReference(
  event: SubscriptionNotification,
): GoogleSubscriptionReference {
  return {
    packageName: event.packageName,
    purchaseToken: event.subscriptionNotification.purchaseToken,
    subscriptionId: event.subscriptionNotification.subscriptionId,
  };
}
