import { DynamoDBStreamEvent } from "aws-lambda";
import {dynamoMapper, putMetric, sendToSqs} from "../utils/aws";
import {ReadSubscription} from "../models/subscription";
import {Stage} from "../utils/appIdentity";
const fetch = require('node-fetch');
import { Response } from 'node-fetch';
import {SoftOptInLog} from "../models/softOptInLogging";
import {getIdentityApiKey} from "../utils/guIdentityApi";

export function isPostAcquisition(startTimestamp: string): boolean {
    const twoDaysInMilliseconds = 48 * 60 * 60 * 1000;
    const today = new Date();
    const acquisitionDate = new Date(startTimestamp);

    return today.getTime() - acquisitionDate.getTime() >= twoDaysInMilliseconds
}

async function updateDynamoLoggingTable(subcriptionId: string, identityId: string) {
    const timestamp = new Date().getTime();
    const record = new SoftOptInLog(identityId, subcriptionId, timestamp, "Soft opt-ins processed for acquisition");

    try {
        await dynamoMapper.put({item: record});
        console.log(`Logged soft opt-in setting to Dynamo`);
    } catch (error) {
        console.warn(`Dynamo write failed for record: ${record}`);
        await putMetric("failed_consents_updates", 1)
    }
}

async function handleError(identityId: string, message: string): Promise<never> {
    console.warn(message);
    await putMetric("failed_consents_updates", 1);
    throw new Error(message);
}

async function getUserEmailAddress(identityId: string, identityApiKey: string): Promise<string> {
    var url = `https://idapi.code.dev-theguardian.com/user/${identityId}`
    if (Stage === "PROD") {
        url = `https://idapi.theguardian.com/user/${identityId}`
    }
    const params = {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${identityApiKey}`
        }
    }

    try {
        console.log(`url ${url}`);

        return fetch(url, params)
            .then(async (response: Response) => {
                if (response.ok) {
                    const json = await response.json();

                    if (!json.user || !json.user.primaryEmailAddress) {
                        return await handleError(identityId, 'User or primaryEmailAddress is undefined');
                    }

                    return json.user.primaryEmailAddress;
                } else {
                    return await handleError(identityId, `warning, status: ${response.status}, while posting consent data for user ${identityId}`);
                }
            })
    } catch (error) {
        return await handleError(identityId, `error while retrieving user data for identityId: ${identityId}`);
    }
}

async function processAcquisition(record: any): Promise<void> {
    const identityId = record?.dynamodb?.NewImage?.userId?.S;
    const subscriptionId = record?.dynamodb?.NewImage?.subscriptionId?.S;

    // fetch the subscription record from the `subscriptions` table as we need to get the acquisition date of the sub to know when to send WelcomeDay0 email
    /*
        Note: the subscription record may have not been created yet. On purchase, the link endpoint and the webhook that
        creates the subscription in the subscription table are executed asynchronously.

         This is not an issue. Since we are using the subscription record's acquisition date to determine if it has been more than two
         days since purchase, if it does not exist yet in the table, then we assume the customer has purchased it just now.
     */
    const records = await dynamoMapper.query(ReadSubscription, {subscriptionId}, {indexName: "subscriptionId"});

    await sendToSqs(`soft-opt-in-consent-setter-queue-${Stage}`, {
        identityId: identityId,
        eventType: "Acquisition",
        productName: "InAppPurchase"
    })

    await updateDynamoLoggingTable(subscriptionId, identityId)

    for await (const record of records) {
        if (isPostAcquisition(record.startTimestamp)) {
            const identityApiKey = await getIdentityApiKey();

            const emailAddress = await getUserEmailAddress(identityId, identityApiKey)

            await sendToSqs("subs-welcome-email", {
                To:{Address: emailAddress,
                    ContactAttributes:{SubscriberAttributes: {}}},
                DataExtensionName:"SV_PA_SOINotification",
                SfContactId:"",
                IdentityUserId: identityId})
        }
    }
}

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
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