import 'source-map-support/register';
import { DynamoDBStreamEvent } from 'aws-lambda';
import { dynamoMapper, putMetric, sendToSqsSoftOptIns } from '../utils/aws';
import {
  UserSubscription,
  UserSubscriptionEmpty,
} from '../models/userSubscription';
import { getMembershipAccountId } from '../utils/guIdentityApi';
import { Region, Stage } from '../utils/appIdentity';
import { mapPlatformToSoftOptInProductName } from '../utils/softOptIns';

async function handleSoftOptInsError(message: string) {
  console.error(message);
  await putMetric('failed_to_send_cancellation_message', 1);
}

async function getUserLinks(subscriptionId: string) {
  // ( comment group #488db8c1 )
  // TODO:
  // In PR: https://github.com/guardian/mobile-purchases/pull/1698
  // we performed a renaming of ReadSubscription to UserSubscriptionEmpty
  // With that said it should now be possible to use UserSubscription instead of
  // UserSubscriptionEmpty as first argument of the dynamoMapper.query(

  const userLinks = await dynamoMapper.query(
    UserSubscriptionEmpty,
    { subscriptionId },
    { indexName: 'subscriptionId-userId' }
  );
  return userLinks;
}

async function deleteUserSubscription(
  userLinks: UserSubscription[]
): Promise<number> {
  let count = 0;
  for (const userLink of userLinks) {
    const deletionResult = await dynamoMapper.delete(userLink);
    if (deletionResult) {
      count++;
    }
  }

  if (userLinks.length != count) {
    console.warn(`Queried ${userLinks.length} rows, but only deleted ${count}`);
  }

  console.log(`Deleted ${count} rows`);
  return count;
}

async function disableSoftOptIns(
  userLinks: UserSubscription[],
  subscriptionId: string,
  platform: string | undefined
) {
  const membershipAccountId = await getMembershipAccountId();
  const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

  const user = userLinks[0];

  await sendToSqsSoftOptIns(
    Stage === 'PROD'
      ? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD`
      : `${queueNamePrefix}/soft-opt-in-consent-setter-queue-CODE`,
    {
      identityId: user.userId,
      eventType: 'Cancellation',
      productName: mapPlatformToSoftOptInProductName(platform),
      subscriptionId: subscriptionId,
    }
  );
  console.log(`sent soft opt-in message for identityId ${user.userId}`);
}

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
  const ttlEvents = event.Records.filter((dynamoEvent) => {
    return (
      dynamoEvent.eventName === 'REMOVE' &&
      dynamoEvent.userIdentity?.type === 'Service' &&
      dynamoEvent.userIdentity?.principalId === 'dynamodb.amazonaws.com' &&
      dynamoEvent.dynamodb?.OldImage?.subscriptionId?.S
    );
  });

  const subscriptions = ttlEvents.map((event) => event.dynamodb?.OldImage);

  let records = 0;
  let rows = 0;
  let softOptInSuccessCount = 0;

  for (const subscription of subscriptions) {
    // We're guaranteed to have a truthy subscription ID here as we filtered
    // out Dynamo record events without it above.
    const subscriptionId = subscription?.subscriptionId?.S!;
    const userLinksIterator = await getUserLinks(subscriptionId);

    const userSubscriptions: UserSubscription[] = [];
    for await (const userLink of userLinksIterator) {
      userSubscriptions.push(userLink);
    }

    if (userSubscriptions.length === 0) {
      console.log(
        `No user links to delete for subscriptionId: ${subscriptionId}`
      );
    } else {
      rows += await deleteUserSubscription(userSubscriptions);

      try {
        const platform = subscription?.platform?.S;
        await disableSoftOptIns(userSubscriptions, subscriptionId, platform);
        softOptInSuccessCount++;
      } catch (e) {
        handleSoftOptInsError(
          `Soft opt-in message send failed for subscriptionId: ${subscriptionId}. ${e}`
        );
      }
    }

    records++;
  }

  console.log(
    `Processed ${records} records from dynamo stream to delete ${rows} rows`
  );

  console.log(
    `Processed ${records} records from dynamo stream to disable soft opt-ins for ${softOptInSuccessCount} users`
  );

  return {
    recordCount: records,
    rowCount: rows,
  };
}
