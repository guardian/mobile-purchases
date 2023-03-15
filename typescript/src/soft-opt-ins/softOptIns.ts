import { DynamoDBStreamEvent } from "aws-lambda";
import {dynamoMapper, sendToSqs} from "../utils/aws";
import {ReadSubscription} from "../models/subscription";
import {Stage} from "../utils/appIdentity";

export function isPostAcquisition(todaysDate: Date, acquisitionDate: Date): boolean {
    const twoDaysInMilliseconds = 48 * 60 * 60 * 1000;

    return todaysDate.getTime() - acquisitionDate.getTime() >= twoDaysInMilliseconds
}

function logToNewDynamoTable(){}

async function processAcquisition(record: any): Promise<void> {
    const identityId = record?.dynamodb?.Keys?.userId?.S;
    const subscriptionId = record?.dynamodb?.Keys?.subscriptionId?.S;

    // fetch the subscription record from the `subscriptions` table as we need to get the acquisition date of the sub to know when to send WelcomeDay0 email
    /*
        Note: the subscription record may have not been created yet. On purchase, the link endpoint and the webhook that
        creates the subscription in the subscription table are executed asynchronously.

         This is not an issue. Since we are using the subscription record's acquisition date to determine if it has been more than two
         days since purchase, if it does not exist yet in the table, then we assume the customer has purchased it just now.
     */
    const records = await dynamoMapper.query(ReadSubscription, {subscriptionId}, {indexName: "subscriptionId"});

    await sendToSqs(Stage === "PROD" ? "soft-opt-in-consent-setter-queue" : "soft-opt-in-consent-setter-queue-DEV", {
        identityId: identityId,
        eventType: "Acquisition",
        productName: "InAppPurchase"
    })

    for await (const record of records) {
        const acquisitionDate = new Date(record.startTimestamp);
        const todayDate = new Date();

        if (isPostAcquisition(todayDate, acquisitionDate)) {
            await sendToSqs("subs-welcome-email", {
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