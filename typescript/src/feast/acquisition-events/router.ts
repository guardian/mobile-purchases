import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { Platform } from "../../models/platform";
import { ReadSubscription } from "../../models/subscription";
import {Stage} from "../../utils/appIdentity";
import { dynamoMapper, sendToSqs } from "../../utils/aws";
import { plusDays } from "../../utils/dates";
import {Region} from "../../utils/appIdentity";


const writeToDLQ = async (dlqUrl: string, subscriptionId: string, identityId: string) => {
    try {
        const timestamp = Date.now();
        await sendToSqs(dlqUrl, {subscriptionId, identityId, timestamp});
    } catch(e) {
        console.error(`could not send message to dead letter queue for identityId: ${identityId}, subscriptionId: ${subscriptionId}. Error: `, e)
    }
}

export const isActiveSubscription = (currentTime: Date, subscriptionRecord: ReadSubscription): boolean => {
    // Check if the subscription is active
    const end = new Date(Date.parse(subscriptionRecord.endTimestamp));
    const endWithGracePeriod = plusDays(end, 30);
    return (currentTime.getTime() <= endWithGracePeriod.getTime());
}

export const processAcquisition = async (subscriptionRecord: ReadSubscription, identityId: string): Promise <boolean> => {
    const subscriptionId = subscriptionRecord.subscriptionId;
    const now = new Date();

    if (!isActiveSubscription(now, subscriptionRecord)) {
        console.log(`Subscription ${subscriptionRecord.subscriptionId} is not active. Stopping processing.`);
        return true;
    }

    console.log('Building Queue Url')

    const mobileAccountId = process.env.MobileAccountId;
    const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${mobileAccountId}`;
    const platform = subscriptionRecord.platform == Platform.IosFeast? 'apple' : 'google';

    const sqsUrl = `${queueNamePrefix}/mobile-purchases-${Stage}-feast-${platform}-acquisition-events-queue`;

    try {
        await sendToSqs(sqsUrl, JSON.stringify(subscriptionRecord));
        console.log(`Event sent to SQS queue: ${sqsUrl} for subscriptionId: ${subscriptionId}`);
        return true;
    } catch (e) {
        if (e instanceof Error) {
            console.error(`failed to send record for subscriptionId: ${subscriptionId} to SQS queue: ${sqsUrl}. Error message is ${e.message}`);
        } else {
            console.error(`failed to send record for subscriptionId: ${subscriptionId} to SQS queue: ${sqsUrl}.`);
        }
        return false;
    }
}

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
    const dlqUrl = process.env.DLQUrl;

    if (!dlqUrl) {
        throw new Error("process.env.DLQUrl is undefined");
    }

    console.log(`dlqUrl: ${dlqUrl}`);

    const records = event.Records;

    let processedCount = 0;

    const processRecordPromises = records.map(async (record: DynamoDBRecord) => {
        const eventName = record.eventName;

        const identityId = record?.dynamodb?.NewImage?.userId?.S || "";
        const subscriptionId = record?.dynamodb?.NewImage?.subscriptionId?.S || "";

        if (eventName === "INSERT") {

            console.log(`identityId: ${identityId}, subscriptionId: ${subscriptionId}`);
            let itemToQuery = new ReadSubscription();
            itemToQuery.setSubscriptionId(subscriptionId);

            let subscriptionRecord: ReadSubscription;

            try {
                subscriptionRecord = await dynamoMapper.get(itemToQuery);
            } catch (error) {
                console.log(`Subscription ${subscriptionId} record not found in the subscriptions table. Error: `, error);
                await writeToDLQ(dlqUrl, subscriptionId, identityId);

                return false;
            }

            const isFeast = subscriptionRecord.platform === Platform.IosFeast || subscriptionRecord.platform === Platform.AndroidFeast;
            if (isFeast) {
                const result = await processAcquisition(subscriptionRecord, identityId);
                if (!result) {
                    await writeToDLQ(dlqUrl, subscriptionId, identityId);
                    return false
                }
                processedCount ++;
                return result;
            }
            return true;
        }
    });

    await Promise.all(processRecordPromises);

    console.log(`Processed ${processedCount} newly inserted records from the link (mobile-purchases-${Stage}-user-subscriptions) DynamoDB table`);
}