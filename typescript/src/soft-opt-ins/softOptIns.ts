import { DynamoDBStreamEvent } from "aws-lambda";
import {dynamoMapper, sendToSqs} from "../utils/aws";
import {ReadSubscription} from "../models/subscription";
import {postConsent} from "../link/link";
import {getAuthToken} from "../utils/guIdentityApi";
import {getConfigValue} from "../utils/ssmConfig";

async function processAcquisition(record: any): Promise<void> {
    const apiKey1Salesforce = await getConfigValue<string>("user.api-key.1.salesforce");

    const identityId = record?.dynamodb?.Keys?.userId?.S;
    const subscriptionId = record?.dynamodb?.Keys?.subscriptionId?.S;

    // fetch the subscription record from the `subscriptions` table as we need to get the acquisition date of the sub to know when to send WelcomeDay0 email
    const records = dynamoMapper.query(ReadSubscription, {subscriptionId}, {indexName: "subscriptionId"});

    const twoDaysInMilliseconds = 48 * 60 * 60 * 1000;

    for await (const record of records) {
        postConsent(identityId, apiKey1Salesforce);

        const acquisitionDate = new Date(record.startTimestamp);
        const todayDate = new Date();

        if ((todayDate.getTime() - acquisitionDate.getTime()) >= twoDaysInMilliseconds) {
            sendToSqs("subs-welcome-email", {
                To:{Address:"example@gmail.com",
                    ContactAttributes:{SubscriberAttributes: {}}},
                DataExtensionName:"SV_PA_SOINotification",
                SfContactId:"sfContactId",
                IdentityUserId: identityId})
        }
    }
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