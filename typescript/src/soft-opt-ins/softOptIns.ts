import { DynamoDBStreamEvent } from "aws-lambda";
import {dynamoMapper} from "../utils/aws";
import {ReadSubscription} from "../models/subscription";

async function processAcquisition(record: any): Promise<void> {
    const subscriptionId = record.dynamodb.Keys.subscriptionId.S ?? "";

    // fetch the subscription record from the `subscriptions` table as we need to get the acquisition date of the sub to know when to send WelcomeDay0 email
    const records = dynamoMapper.query(ReadSubscription, {subscriptionId}, {indexName: "subscriptionId"});

    const oneDayInMilliseconds = 24 * 60 * 60 * 1000;

    for await (const record of records) {
        // pascals idapi code here

        const timestampDate = new Date(record.startTimestamp);
        const todayDate = new Date();

        if ((todayDate.getTime() - timestampDate.getTime()) >= oneDayInMilliseconds) {
            // send welcomeday0 email
        }
    }

    // FOR V1: check acquisition date equals today
    // For V2+: Send welcomeday0 email if sub's `start_timestamp` property is in a given time window
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