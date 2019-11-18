import 'source-map-support/register'
import {DynamoDBStreamEvent} from "aws-lambda";
import {dynamoMapper} from "../utils/aws";
import {ReadUserSubscription} from "../models/userSubscription";

async function deleteUserSubscription(subscriptionId: string): Promise<number> {
    let count = 0;
    const userLinks = await dynamoMapper.query(ReadUserSubscription, {subscriptionId}, {indexName: "subscriptionId-userId"});
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

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
    const ttlEvents = event.Records.filter(dynamoEvent => {
        return dynamoEvent.eventName == "REMOVE" &&
            dynamoEvent.userIdentity?.type == "Service" &&
            dynamoEvent.userIdentity?.principalId == "dynamodb.amazonaws.com" &&
            dynamoEvent.dynamodb?.Keys?.subscriptionId
    });

    const subscriptionsPromises = ttlEvents
        // @ts-ignore
        .map(event => event.dynamodb.Keys.subscriptionId.S ?? "")
        .map(deleteUserSubscription);


    let records = 0;
    let rows = 0;
    for await (const deletedCount of subscriptionsPromises) {
        records++;
        rows += deletedCount;
    }

    console.log(`Processed ${records} records from dynamo stream to delete ${rows} rows`);

    return {
        recordCount: records,
        rowCount: rows
    }
}