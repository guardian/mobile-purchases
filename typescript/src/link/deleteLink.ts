import 'source-map-support/register'
import {DynamoDBStreamEvent} from "aws-lambda";
import {dynamoMapper, putMetric, sendToSqsSoftOptIns} from "../utils/aws";
import {ReadUserSubscription} from "../models/userSubscription";
import {getMembershipAccountId} from "../utils/guIdentityApi";
import {Region, Stage} from "../utils/appIdentity";
import {SoftOptInLog} from "../models/softOptInLogging";

async function updateDynamoLoggingTable(subcriptionId: string, identityId: string) {
    const timestamp = new Date().getTime();
    const record = new SoftOptInLog(identityId, subcriptionId, timestamp, "Soft opt-ins processed for expired subscription");

    await dynamoMapper.put({item: record});
    console.log(`Logged soft opt-in setting to Dynamo`);
}

async function handleSoftOptInsError(message: string) {
    console.error(message);
    await putMetric("failed_to_send_cancellation_message", 1);
}

async function getUserLinks(subscriptionId: string) {
    const userLinks = await dynamoMapper.query(ReadUserSubscription, {subscriptionId}, {indexName: "subscriptionId-userId"});
    return userLinks;
}

async function deleteUserSubscription(userLinks: ReadUserSubscription[]): Promise<number> {
    let count = 0;
    for (const userLink of userLinks) {
        const deletionResult = await dynamoMapper.delete(userLink);
        if (deletionResult) {
            count++;
        }
    }

    if (userLinks.length != count) {
        console.warn(`Queried ${userLinks.length} rows, but only deleted ${count}`)
    }

    console.log(`Deleted ${count} rows`);
    return count;
}

let softOptInSuccessCount = 0;

async function disableSoftOptIns(userLinks: ReadUserSubscription[], subscriptionId: string) {
    const membershipAccountId = await getMembershipAccountId();
    const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

    const user = userLinks[0];

    await sendToSqsSoftOptIns(Stage === "PROD" ? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD` : `${queueNamePrefix}/soft-opt-in-consent-setter-queue-DEV`, {
        identityId: user.userId,
        eventType: "Cancellation",
        productName: "InAppPurchase",
        subscriptionId: subscriptionId
    });
    console.log(`sent soft opt-in message for identityId ${user.userId}`);

    await updateDynamoLoggingTable(subscriptionId, user.userId);

    softOptInSuccessCount++;
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

    for (const subscriptionId of subscriptionIds) {
        const userLinksIterator = await getUserLinks(subscriptionId);

        const userSubscriptions: ReadUserSubscription[] = [];
        for await (const userLink of userLinksIterator) {
            userSubscriptions.push(userLink);
        }

        if (userSubscriptions.length === 0) {
            console.log(`No user links to delete for subscriptionId: ${subscriptionId}`)
        } else {
            rows += await deleteUserSubscription(userSubscriptions);

            try {
                await disableSoftOptIns(userSubscriptions, subscriptionId);
            } catch (e) {
                handleSoftOptInsError(`Soft opt-in message send failed for subscriptionId: ${subscriptionId}. ${e}`)
            }
        }

        records++;
    }

    console.log(`Processed ${records} records from dynamo stream to delete ${rows} rows`);

    console.log(`Processed ${records} records from dynamo stream to disable soft opt-ins for ${softOptInSuccessCount} users`);

    return {
        recordCount: records,
        rowCount: rows
    }
}