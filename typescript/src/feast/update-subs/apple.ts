import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { App } from '../../models/app';
import { GracefulProcessingError } from '../../models/GracefulProcessingError';
import { ProcessingError } from '../../models/processingError';
import type { Subscription } from '../../models/subscription';
import type { AppleSubscriptionReference } from '../../models/subscriptionReference';
import { UserSubscription } from '../../models/userSubscription';
import { validateReceipt } from '../../services/appleValidateReceipts';
import { getIdentityIdFromBraze } from '../../services/braze';
import { toAppleSubscription } from '../../update-subs/apple';
import { dynamoMapper } from '../../utils/aws';
import {
  queueHistoricalSubscription as defaultSendSubscriptionToHistoricalQueue,
  storeUserSubscriptionInDynamo as defaultStoreUserSubscriptionInDynamo,
} from './common';

export type SubscriptionMaybeWithAppAccountToken = Subscription & {
  appAccountToken?: string;
};

export const withAppAccountToken = (
  subscription: Subscription,
  appAccountToken: string,
): SubscriptionMaybeWithAppAccountToken =>
  Object.assign(subscription, { appAccountToken: appAccountToken });

const decodeSubscriptionReference = (
  record: SQSRecord,
): AppleSubscriptionReference => {
  return JSON.parse(record.body) as AppleSubscriptionReference;
};

export const defaultFetchSubscriptionsFromApple = async (
  reference: AppleSubscriptionReference,
): Promise<SubscriptionMaybeWithAppAccountToken[]> => {
  const responses = await validateReceipt(
    reference.receipt,
    { sandboxRetry: false },
    App.Feast,
  );
  return responses.map((response) => {
    const subscription = toAppleSubscription(response);
    if (response.latestReceiptInfo.appAccountToken) {
      return withAppAccountToken(
        subscription,
        response.latestReceiptInfo.appAccountToken,
      );
    } else {
      return subscription;
    }
  });
};

const defaultStoreSubscriptionInDynamo = (
  subscription: Subscription,
): Promise<void> => {
  return dynamoMapper.put({ item: subscription }).then((_) => {});
};

type FetchSubsFromApple = (
  reference: AppleSubscriptionReference,
) => Promise<SubscriptionMaybeWithAppAccountToken[]>;
type StoreSubInDynamo = (subscription: Subscription) => Promise<void>;
type SendSubToHistoricalQueue = (subscription: Subscription) => Promise<void>;
type ExchangeExternalIdForIdentityId = (externalId: string) => Promise<string>;
type StoreUserSubInDynamo = (
  userSubscription: UserSubscription,
) => Promise<void>;

const processRecord = async (
  fetchSubscriptionsFromApple: FetchSubsFromApple,
  storeSubscriptionInDynamo: StoreSubInDynamo,
  sendSubscriptionToHistoricalQueue: SendSubToHistoricalQueue,
  exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId,
  storeUserSubscriptionInDynamo: StoreUserSubInDynamo,
  record: SQSRecord,
) => {
  const reference = decodeSubscriptionReference(record);

  const subscriptions = await fetchSubscriptionsFromApple(reference);

  await Promise.all(subscriptions.map(storeSubscriptionInDynamo));
  await Promise.all(subscriptions.map(sendSubscriptionToHistoricalQueue));

  await Promise.all(
    subscriptions.map(async (s) => {
      if (s.appAccountToken) {
        const identityId = await exchangeExternalIdForIdentityId(
          s.appAccountToken,
        );
        const now = new Date().toISOString();
        const linked = new UserSubscription(identityId, s.subscriptionId, now);
        await storeUserSubscriptionInDynamo(linked);
      } else {
        console.log(
          `Subscription with receipt '${s.receipt}' did not have an 'appAccountToken'`,
        );
      }
    }),
  );
};

const processRecordWithErrorHandling = async (
  fetchSubscriptionsFromApple: FetchSubsFromApple,
  storeSubscriptionInDynamo: StoreSubInDynamo,
  sendSubscriptionToHistoricalQueue: SendSubToHistoricalQueue,
  exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId,
  storeUserSubscriptionInDynamo: StoreUserSubInDynamo,
  record: SQSRecord,
) => {
  try {
    return await processRecord(
      fetchSubscriptionsFromApple,
      storeSubscriptionInDynamo,
      sendSubscriptionToHistoricalQueue,
      exchangeExternalIdForIdentityId,
      storeUserSubscriptionInDynamo,
      record,
    );
  } catch (error) {
    if (error instanceof GracefulProcessingError) {
      console.warn(
        'Error processing the subscription update is being handled gracefully',
        error,
      );
      return;
    } else {
      console.error('Unexpected error, will throw to retry: ', error);
      throw error;
    }
  }
};

export function buildHandler(
  fetchSubscriptionsFromApple: FetchSubsFromApple = defaultFetchSubscriptionsFromApple,
  storeSubscriptionInDynamo: StoreSubInDynamo = defaultStoreSubscriptionInDynamo,
  sendSubscriptionToHistoricalQueue: SendSubToHistoricalQueue = defaultSendSubscriptionToHistoricalQueue,
  exchangeExternalIdForIdentityId: ExchangeExternalIdForIdentityId = getIdentityIdFromBraze,
  storeUserSubscriptionInDynamo: StoreUserSubInDynamo = defaultStoreUserSubscriptionInDynamo,
): (event: SQSEvent) => Promise<string> {
  return (event: SQSEvent) => {
    const promises = event.Records.map((record) => {
      return processRecordWithErrorHandling(
        fetchSubscriptionsFromApple,
        storeSubscriptionInDynamo,
        sendSubscriptionToHistoricalQueue,
        exchangeExternalIdForIdentityId,
        storeUserSubscriptionInDynamo,
        record,
      );
    });

    return Promise.all(promises)
      .then((promises) => {
        console.log(`Successfully processed ${promises.length} record(s)`);
        return promises;
      })
      .then((_) => 'OK');
  };
}

export const handler = buildHandler();
