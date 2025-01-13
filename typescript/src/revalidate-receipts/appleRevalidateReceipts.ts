import type { ScanIterator } from '@aws/dynamodb-data-mapper';
import type { AndExpression } from '@aws/dynamodb-expressions';
import {
  attributeExists,
  equals,
  greaterThan,
  lessThan,
} from '@aws/dynamodb-expressions';
import { EndTimeStampFilterSubscription } from '../models/endTimestampFilter';
import { Platform } from '../models/platform';
import type {
  AppleSubscriptionReference,
  SubscriptionReference,
} from '../models/subscriptionReference';
import { dynamoMapper, sendToSqs } from '../utils/aws';
import { plusDays, plusHours } from '../utils/dates';

function endTimestampForQuery(event: ScheduleEvent): Date {
  if (event.endTimestampFilter) {
    return new Date(Date.parse(event.endTimestampFilter));
  } else {
    return plusHours(new Date(), 13);
  }
}

function startTimestampForQuery(event: ScheduleEvent): Date {
  if (event.startTimestampFilter) {
    return new Date(Date.parse(event.startTimestampFilter));
  } else {
    return plusDays(new Date(), -60);
  }
}

export interface ScheduleEvent {
  endTimestampFilter?: string;
  startTimestampFilter?: string;
}

const queueUrlForPlatform = (platform: string): string => {
  const LiveAppSqsUrl = process.env.LiveAppSqsUrl;
  if (LiveAppSqsUrl === undefined) {
    throw new Error('No LiveAppSqsUrl env parameter provided');
  }

  const FeastAppSqsUrl = process.env.FeastAppSqsUrl;
  if (FeastAppSqsUrl === undefined) {
    throw new Error('No FeastAppSqsUrl env parameter provided');
  }

  switch (platform) {
    case Platform.IosFeast:
      return FeastAppSqsUrl;
    default:
      return LiveAppSqsUrl;
  }
};

const defaultSubscriptions = (
  event: ScheduleEvent,
): ScanIterator<EndTimeStampFilterSubscription> => {
  const startTimestamp = startTimestampForQuery(event).toISOString();
  const endTimestamp = endTimestampForQuery(event).toISOString();
  console.log(`Will filter subscriptions before ${endTimestamp}`);

  const filter: AndExpression = {
    type: 'And',
    conditions: [
      {
        ...equals(true),
        subject: 'autoRenewing',
      },
      {
        ...attributeExists(),
        subject: 'receipt',
      },
      {
        ...lessThan(endTimestamp),
        subject: 'endTimestamp',
      },
      {
        ...greaterThan(startTimestamp),
        subject: 'endTimestamp',
      },
    ],
  };

  return dynamoMapper.scan(EndTimeStampFilterSubscription, {
    indexName: 'ios-endTimestamp-revalidation-index-with-platform',
    filter: filter,
  });
};

const defaultSendSubscriptionReferenceToQueue = async (
  queue: string,
  ref: SubscriptionReference,
  delayInSeconds: number,
): Promise<void> => {
  await sendToSqs(queue, ref, delayInSeconds);
};

export function buildHandler(
  subscriptions: (
    event: ScheduleEvent,
  ) => ScanIterator<EndTimeStampFilterSubscription> = defaultSubscriptions,
  sendSubscriptionReferenceToQueue: (
    queue: string,
    ref: SubscriptionReference,
    delayInSeconds: number,
  ) => Promise<void> = defaultSendSubscriptionReferenceToQueue,
): (event: ScheduleEvent) => Promise<void> {
  return async (event: ScheduleEvent) => {
    const sendCounts = { feast: 0, 'non-feast': 0 };
    for await (const subscription of subscriptions(event)) {
      const receipt: string | undefined = subscription.receipt;
      if (receipt) {
        const subscriptionReference: AppleSubscriptionReference = {
          receipt: receipt,
        };
        const countKey =
          subscription.platform == Platform.IosFeast ? 'feast' : 'non-feast';
        const delayInSeconds = Math.min(
          Math.floor(sendCounts[countKey] / 10),
          900,
        );
        const sqsUrl = queueUrlForPlatform(subscription.platform);
        await sendSubscriptionReferenceToQueue(
          sqsUrl,
          subscriptionReference,
          delayInSeconds,
        );
        sendCounts[countKey]++;
        console.log(
          `Sent ${subscription.platform} subscription with id: ${subscription.subscriptionId} and expiry timestamp: ${subscription.endTimestamp}`,
        );
      } else {
        console.warn(`No receipt found for ${subscription.subscriptionId}`);
      }
    }
    console.log(
      `Sent ${sendCounts['non-feast']} non-Feast subscriptions and ${sendCounts['feast']} Feast subscriptions to be re-validated.`,
    );
  };
}

export const handler = buildHandler();
