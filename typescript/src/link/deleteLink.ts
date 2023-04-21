import 'source-map-support/register'
import {DynamoDBStreamEvent} from "aws-lambda";
import {dynamoMapper, putMetric, sendToSqsSoftOptIns} from "../utils/aws";
import {ReadUserSubscription} from "../models/userSubscription";
import {getMembershipAccountId} from "../utils/guIdentityApi";
import {Region, Stage} from "../utils/appIdentity";
import {SoftOptInLog} from "../models/softOptInLogging";
import {QueryIterator} from "@aws/dynamodb-data-mapper";

async function updateDynamoLoggingTable(subcriptionId: string, identityId: string) {
    const timestamp = new Date().getTime();
    const record = new SoftOptInLog(identityId, subcriptionId, timestamp, "Soft opt-ins processed for expired subscription");

    try {
        await dynamoMapper.put({item: record});
        console.log(`Logged soft opt-in setting to Dynamo`);
    } catch (error) {
        handleSoftOptInsError(`Dynamo write failed for record: ${record}`);
    }
}

async function handleSoftOptInsError(message: string): Promise<never> {
    console.warn(message);
    await putMetric("failed_to_send_cancellation_message", 1);
    throw new Error(message);
}

async function getUserLinks(subscriptionId: string) {
    const userLinks = await dynamoMapper.query(ReadUserSubscription, {subscriptionId}, {indexName: "subscriptionId-userId"});
    return userLinks;
}

async function deleteUserSubscription(userLinks: QueryIterator<ReadUserSubscription>): Promise<number> {
    let count = 0;
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

async function disableSoftOptIns(userLinks: QueryIterator<ReadUserSubscription>, subscriptionId: string) {
    const membershipAccountId = await getMembershipAccountId();
    const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

    const userSubscriptions = [];

    for await (const userLink of userLinks) {
        userSubscriptions.push(userLink);
    }

    const user = userSubscriptions[0];

    try {
        await sendToSqsSoftOptIns(Stage === "PROD" ? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD` : `${queueNamePrefix}/soft-opt-in-consent-setter-queue-DEV`, {
            identityId: user.userId,
            eventType: "Cancellation",
            productName: "InAppPurchase"
        });
        console.log(`send soft opt-in message for identityId ${user.userId}`);
    } catch (e) {
        handleSoftOptInsError(`Soft opt-in message send failed for identityId: ${user.userId}`)
    }

    await updateDynamoLoggingTable(subscriptionId, user.userId);
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

    let records = 0;
    let rows = 0;

    const featureFlag = false;

    for (const subscriptionId of subscriptionIds) {
        const userLinks = await getUserLinks(subscriptionId);
        rows += await deleteUserSubscription(userLinks);

        if (featureFlag) {
            await disableSoftOptIns(userLinks, subscriptionId);
        }
        records++;
    }

    console.log(`Processed ${records} records from dynamo stream to delete ${rows} rows`);

    if (featureFlag) {
        console.log(`Processed ${records} records from dynamo stream to disable soft opt-ins for ${records} users`);
    }

    return {
        recordCount: records,
        rowCount: rows
    }
}