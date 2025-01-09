import type { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { Subscription, SubscriptionEmpty } from "../../models/subscription";
import { dynamoMapper, sendToSqs } from "../../utils/aws";
import { Platform } from "../../models/platform";
import { plusDays } from "../../utils/dates";
import { Region, Stage } from "../../utils/appIdentity";

const isActiveSubscription = (
  currentTime: Date,
  subscription: Subscription,
): boolean => {
  // Returns whether the subscription is active or not, by checking
  // that the current time is before the end of the subscription plus the grace period.
  // The grace period is 30 days.
  const end = new Date(Date.parse(subscription.endTimestamp));
  const endWithGracePeriod = plusDays(end, 30);
  return currentTime.getTime() <= endWithGracePeriod.getTime();
};

const processAcquisition = async (
  subscription: Subscription,
): Promise<boolean> => {
  // return value indicates whether the processing was successful or not
  // We return true in the case of an inactive subscription.

  console.log(
    `[46218776] Processing acquisition for subscription: ${JSON.stringify(subscription)}`,
  );
  const subscriptionId = subscription.subscriptionId;

  if (!isActiveSubscription(new Date(), subscription)) {
    console.log(
      `Subscription ${subscription.subscriptionId} is not active. Processing stopped.`,
    );
    return true;
  }

  const mobileAccountId = process.env.MobileAccountId;
  const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${mobileAccountId}`;
  const platform =
    subscription.platform == Platform.IosFeast ? "apple" : "google";

  const sqsUrl = `${queueNamePrefix}/mobile-purchases-${Stage}-feast-${platform}-acquisition-events-queue`;

  console.log(`sqsUrl: ${sqsUrl}`);

  console.log(`[9507d8b6] posting subscription to SQS`);

  try {
    await sendToSqs(sqsUrl, subscription);
    console.log(
      `Event sent to acquisition events queue: ${sqsUrl}, for subscriptionId: ${subscriptionId}`,
    );
    return true;
  } catch (error) {
    console.error(
      `failed to send record for subscriptionId: ${subscriptionId} to acquisition events queue: ${sqsUrl}. Error message is ${error}`,
    );
    return false;
  }
};

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  console.log(
    "[c9900d41] Feast Acquisition Events Router Lambda has been called",
  );

  const records = event.Records; // retrieve records from DynamoDBStreamEvent

  let insertReceivedCount = 0;
  let insertProcessedCount = 0;

  const processRecordPromises = records.map(async (record: DynamoDBRecord) => {
    console.log(`Processing: record: ${JSON.stringify(record)}`);

    const eventName = record.eventName;

    // We are only interested in the "INSERT" eventName
    if (eventName !== "INSERT") {
      console.log(`Skipping: ${eventName} record`);
      return;
    }

    insertReceivedCount++;

    const identityId = record?.dynamodb?.NewImage?.userId?.S || "";
    const subscriptionId = record?.dynamodb?.NewImage?.subscriptionId?.S || "";
    console.log(
      `Processing: ${eventName} record for identityId: ${identityId} and subscriptionId: ${subscriptionId}`,
    );

    let emptySubscription = new SubscriptionEmpty();
    emptySubscription.setSubscriptionId(subscriptionId);

    let subscription: Subscription;

    try {
      subscription = await dynamoMapper.get(emptySubscription);
    } catch (error) {
      console.log(`[d2c0251e] Subscription ${subscriptionId}, error: `, error);
      // We are exiting but TODO: we are going to write to the dead letter queue.
      return;
    }

    console.log(`subscription ${JSON.stringify(subscription)}`);

    const isFeast =
      subscription.platform === Platform.IosFeast ||
      subscription.platform === Platform.AndroidFeast;

    // We are only interested in feast subscriptions
    if (!isFeast) {
      console.log(`Skipping non Feast subscription ${subscriptionId}`);
      return;
    }

    const result = await processAcquisition(subscription);
    if (!result) {
      // We are exiting but TODO: we are going to write to the dead letter queue.
      return;
    }

    insertProcessedCount++;
  });

  await Promise.all(processRecordPromises);

  console.log(
    `Sucessfully processed ${insertProcessedCount} insertions from a collection of ${insertReceivedCount} from DynamoDBStreamEvent`,
  );
};

// --------------------------------------------------------------------------
// Documentation
// --------------------------------------------------------------------------

/*
Example (sanited) of a DynamoDBStreamEvent's single record
{
    "eventID": "88269a13666b1e308cfa9a2a605872b4",
    "eventName": "INSERT",
    "eventVersion": "1.1",
    "eventSource": "aws:dynamodb",
    "awsRegion": "eu-west-1",
    "dynamodb": {
        "ApproximateCreationDateTime": 1731345389,
        "Keys": {
            "subscriptionId": {
                "S": "0987654321"
            },
            "userId": {
                "S": "1234567890"
            }
        },
        "NewImage": {
            "creationTimestamp": {
                "S": "2024-11-11T17:16:29.237Z"
            },
            "subscriptionId": {
                "S": "0987654321"
            },
            "userId": {
                "S": "1234567890"
            }
        },
        "SequenceNumber": "8935985800002395190001559217",
        "SizeBytes": 129,
        "StreamViewType": "NEW_IMAGE"
    },
    "eventSourceARN": "arn:aws:dynamodb:eu-west-1:201359054765:table/mobile-purchases-PROD-user-subscriptions/stream/2023-03-29T15:54:42.240"
}

Possible event names: "INSERT", "MODIFY", "REMOVE"

Subscription Example (sanited):
{
    "subscriptionId": "bjbl[sanited]iLNPQ",
    "startTimestamp": "2020-06-12T07:00:59.108Z",
    "endTimestamp": "2025-06-19T09:00:35.482Z",
    "autoRenewing": true,
    "productId": "com.guardian.subscription.annual.13",
    "platform": "android",
    "freeTrial": false,
    "billingPeriod": "P1Y",
    "googlePayload": {
        "startTimeMillis": "1591945259108",
        "priceAmountMicros": "94990000",
        "orderId": "GPA.[sanited]09414..4",
        "expiryTimeMillis": "1750323635482",
        "countryCode": "US",
        "kind": "androidpublisher#subscriptionPurchase",
        "acknowledgementState": 1,
        "developerPayload": null,
        "paymentState": 1,
        "priceCurrencyCode": "USD",
        "autoRenewing": true
    },
    "applePayload": null,
    "ttl": 1829206836,
    "tableName": "subscriptions"
}

*/
