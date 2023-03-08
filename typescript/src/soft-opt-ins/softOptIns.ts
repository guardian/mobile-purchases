import { DynamoDBStreamEvent } from "aws-lambda";
import {dynamoMapper} from "../utils/aws";
import {ReadUserSubscription} from "../models/userSubscription";

async function processAcquisition(record: any): Promise<void> {
    const subscriptionId = record.dynamodb.Keys.subscriptionId.S ?? "";

    // fetch the subscription record from the `subscriptions` table as we need to get the acquisition date of the sub to know when to send WelcomeDay0 email
    const sub = await dynamoMapper.query(ReadUserSubscription, {subscriptionId}, {indexName: "subscriptionId"});

    // Send welcomeday0 email if sub's `start_timestamp` property is in a given time window

    // pascals idapi code here
}

export async function acquisitionHandler(event: DynamoDBStreamEvent): Promise<any> {
    const records = event.Records;

    const processRecordPromises = records.map((record) => {
        const eventName = record.eventName;

        if (eventName === "INSERT") {
            return processAcquisition(record);
        }
    });

    await Promise.all(processRecordPromises);

    console.log(`Processed ${records.length} newly inserted records from the link (insert full name) DynamoDB table`);
}