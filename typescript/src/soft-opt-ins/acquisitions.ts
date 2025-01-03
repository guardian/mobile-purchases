import {DynamoDBRecord, DynamoDBStreamEvent} from "aws-lambda";
import {Stage} from "../utils/appIdentity";
import { processAcquisition } from "./processSubscription";
import { SubscriptionEmpty, Subscription } from "../models/subscription";
import {dynamoMapper, sendToSqs} from "../utils/aws";

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
    const dlqUrl = process.env.DLQUrl;

    if (!dlqUrl) {
        throw new Error("process.env.DLQUrl is undefined");
    }

    console.log(`dlqUrl: ${dlqUrl}`);

    const records = event.Records;

    console.log(`[8a9ae63f] ${JSON.stringify(records)}`);

    let processedCount = 0;

    const processRecordPromises = records.map(async (record: DynamoDBRecord) => {
        console.log(`[34828b51] ${JSON.stringify(record)}`);
        const eventName = record.eventName;
        const identityId = record?.dynamodb?.NewImage?.userId?.S || "";
        const subscriptionId = record?.dynamodb?.NewImage?.subscriptionId?.S || "";

        if (eventName === "INSERT") {
            processedCount++;

            console.log(`identityId: ${identityId}, subscriptionId: ${subscriptionId}`);

            let itemToQuery = new SubscriptionEmpty();
            itemToQuery.setSubscriptionId(subscriptionId);
            console.log(`[1fe300a7] ${JSON.stringify(itemToQuery)}`);

            let subscriptionRecord: Subscription;

            try {
                subscriptionRecord = await dynamoMapper.get(itemToQuery);
                console.log(`[7c0646c5] ${JSON.stringify(subscriptionRecord)}`);
            } catch (error) {
                console.log(`Subscription ${subscriptionId} record not found in the subscriptions table. Error: `, error);
                try {
                    const timestamp = Date.now();
                    const m1 = {subscriptionId, identityId, timestamp};
                    console.log(`[a609b6f5] ${JSON.stringify(m1)}`);
                    await sendToSqs(dlqUrl, m1);
                } catch(e) {
                    console.log(`could not send message to dead letter queue for identityId: ${identityId}, subscriptionId: ${subscriptionId}. Error: `, e)
                }

                return false;
            }

            return processAcquisition(subscriptionRecord, identityId);
        }
    });

    await Promise.all(processRecordPromises);

    console.log(`Processed ${processedCount} newly inserted records from the link (mobile-purchases-${Stage}-user-subscriptions) DynamoDB table`);
}