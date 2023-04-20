import 'source-map-support/register'
import {DynamoDBStreamEvent} from "aws-lambda";
import {dynamoMapper, sendToSqsSoftOptIns} from "../utils/aws";
import {ReadUserSubscription} from "../models/userSubscription";
import {getMembershipAccountId} from "../utils/guIdentityApi";
import {Region, Stage} from "../utils/appIdentity";

async function getUserLinks(subscriptionId: string) {
    const userLinks = await dynamoMapper.query(ReadUserSubscription, {subscriptionId}, {indexName: "subscriptionId-userId"});
    return userLinks;
}

async function deleteUserSubscription(subscriptionId: string): Promise<number> {
    let count = 0;
    const userLinks = await getUserLinks(subscriptionId);
    for await (const userLink of userLinks) {
        const deletionResult = await dynamoMapper.delete(userLink);
        if (deletionResult) {
            count++;
        }
    }

    if (userLinks.count != count) {
        console.warn(`Queried ${userLinks.count} rows, but only deleted ${count}`)
    }

    console.log(`Deleted ${count} rows`);
    return count;
}

async function disableSoftOptIns(subscriptionId: string) {
    const membershipAccountId = await getMembershipAccountId();
    const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

    const userLinks = await getUserLinks(subscriptionId);
    const userSubscriptions = [];

    for await (const userLink of userLinks) {
        userSubscriptions.push(userLink);
    }

    const userId = userSubscriptions[0];

    await sendToSqsSoftOptIns(Stage === "PROD" ? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD` : `${queueNamePrefix}/soft-opt-in-consent-setter-queue-DEV`, {
        identityId: userId,
        eventType: "Cancellation",
        productName: "InAppPurchase"
    })
}

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
    const ttlEvents = event.Records.filter(dynamoEvent => {
        return dynamoEvent.eventName === "REMOVE" &&
            dynamoEvent.userIdentity?.type === "Service" &&
            dynamoEvent.userIdentity?.principalId === "dynamodb.amazonaws.com" &&
            dynamoEvent.dynamodb?.OldImage?.subscriptionId
    });

    const subscriptionIds = ttlEvents
        // @ts-ignore
        .map(event => event.dynamodb.OldImage.subscriptionId.S ?? "");

    const subscriptionsPromises = subscriptionIds.map(deleteUserSubscription);

    let records = 0;
    let rows = 0;
    for await (const deletedCount of subscriptionsPromises) {
        records++;
        rows += deletedCount;
    }

    console.log(`Processed ${records} records from dynamo stream to delete ${rows} rows`);

    const featureFlag = false;

    if (featureFlag) {
        for (const subscriptionId of subscriptionIds) {
            await disableSoftOptIns(subscriptionId);
        }

        console.log(`Processed ${records} records from dynamo stream to disable soft opt-ins for ${records} users`);
    }

    return {
        recordCount: records,
        rowCount: rows
    }
}