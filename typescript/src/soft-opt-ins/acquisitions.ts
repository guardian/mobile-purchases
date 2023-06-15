import {DynamoDBRecord, DynamoDBStreamEvent} from "aws-lambda";
import {dynamoMapper, sendToSqsComms, sendToSqsSoftOptIns, SoftOptInEvent} from "../utils/aws";
import {ReadSubscription} from "../models/subscription";
import {Region, Stage} from "../utils/appIdentity";
import fetch from 'node-fetch';
import { Response } from 'node-fetch';
import {getIdentityApiKey, getIdentityUrl, getMembershipAccountId} from "../utils/guIdentityApi";
import {plusDays} from "../utils/dates";
import * as retry from 'retry';

export function isPostAcquisition(startTimestamp: string): boolean {
    const twoDaysInMilliseconds = 48 * 60 * 60 * 1000;
    const today = new Date();
    const acquisitionDate = new Date(startTimestamp);

    return today.getTime() - acquisitionDate.getTime() >= twoDaysInMilliseconds
}

async function handleError(message: string): Promise<never> {
    console.warn(message);
    throw new Error(message);
}

async function getUserEmailAddress(identityId: string, identityApiKey: string): Promise<string> {
    const domain = await getIdentityUrl();
    const url = `${domain}/user/${identityId}`;

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
                        return await handleError(`User or primaryEmailAddress is undefined for user ${identityId}`);
                    }

                    return json.user.primaryEmailAddress;
                } else {
                    return await handleError(`Could not fetch details from identity API for user ${identityId}`);
                }
            })
    } catch (error) {
        return await handleError(`error while retrieving user data for identityId: ${identityId}: ${error}`);
    }
}

async function sendSoftOptIns(identityId: string, subscriptionId: string, queueNamePrefix: string) {
    const message: SoftOptInEvent = {
        identityId: identityId,
        eventType: "Acquisition",
        productName: "InAppPurchase",
        subscriptionId: subscriptionId
    };

    await sendToSqsSoftOptIns(
        Stage === "PROD"
            ? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD`
            : `${queueNamePrefix}/soft-opt-in-consent-setter-queue-DEV`,
        message
    );
    console.log(`Sent message to soft-opt-in-consent-setter-queue for user: ${identityId}: ${JSON.stringify(message)}`)
}

async function getSubscriptionRecordWithRetry(itemToQuery: ReadSubscription): Promise<ReadSubscription | null> {
    return new Promise((resolve, reject) => {
        const retryOptions = {
            retries: 3,
            factor: 2, // Exponential backoff factor
            minTimeout: 60 * 1000, // Initial wait time (1 minute)
            maxTimeout: 5 * 60 * 1000 // Maximum wait time (5 minutes)
        };
        const operation = retry.operation(retryOptions);

        operation.attempt(async function(currentAttempt: any) {
            try {
                const subscriptionRecord = await dynamoMapper.get(itemToQuery);
                resolve(subscriptionRecord);
            } catch (error) {
                if (operation.retry(error)) {
                    console.log(`Attempt #${currentAttempt} to get subscription ${itemToQuery.subscriptionId} record failed. Retrying...`);
                    return;
                }
                console.log(`Subscription ${itemToQuery.subscriptionId} record not found in the subscriptions table. Error: `, error);
                resolve(null);
            }
        });
    });
}


async function processAcquisition(record: DynamoDBRecord): Promise<void> {
    const identityId = record?.dynamodb?.NewImage?.userId?.S || "";
    const subscriptionId = record?.dynamodb?.NewImage?.subscriptionId?.S || "";

    console.log(`identityId: ${identityId}, subscriptionId: ${subscriptionId}`);

    let itemToQuery = new ReadSubscription();
    itemToQuery.setSubscriptionId(subscriptionId);

    let subscriptionRecord = await getSubscriptionRecordWithRetry(itemToQuery);

    if (!subscriptionRecord) {
        return;
    }

    // Check if the subscription is active
    const now = new Date();
    const end = new Date(Date.parse(subscriptionRecord.endTimestamp));
    const endWithGracePeriod = plusDays(end, 30);
    const valid: boolean = now.getTime() <= endWithGracePeriod.getTime();

    if (!valid) {
        console.log(`Subscription ${subscriptionId} is not active. Stopping processing.`);
        return;
    }

    console.log("Setting soft opt-ins for acquisition event");

    const membershipAccountId = await getMembershipAccountId();
    const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

    try {
        await sendSoftOptIns(identityId, subscriptionId, queueNamePrefix);
    } catch (e) {
        handleError(`Soft opt-in message send failed for subscriptionId: ${subscriptionId}. ${e}`)
    }

    if (subscriptionRecord && isPostAcquisition(subscriptionRecord.startTimestamp)) {
        const identityApiKey = await getIdentityApiKey();

        const emailAddress = await getUserEmailAddress(identityId, identityApiKey);
        const brazeMessage = {
            To: {
                Address: emailAddress,
                ContactAttributes: {SubscriberAttributes: {}}
            },
            DataExtensionName: "SV_PA_SOINotification",
            IdentityUserId: identityId
        };

        try {
            await sendToSqsComms(`${queueNamePrefix}/braze-emails-${Stage}`, brazeMessage);
        } catch (e) {
            handleError(`Failed to send comms for subscriptionId: ${subscriptionId}. ${e}`)
        }

        console.log(`Sent message to braze-emails queue for user: ${identityId}: ${JSON.stringify(brazeMessage)}`)
    }
}

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
    const records = event.Records;

    let processedCount = 0;

    const processRecordPromises = records.map((record: DynamoDBRecord) => {
        const eventName = record.eventName;

        if (eventName === "INSERT") {
            processedCount++;
            return processAcquisition(record);
        }
    });

    await Promise.all(processRecordPromises);

    console.log(`Processed ${processedCount} newly inserted records from the link (mobile-purchases-${Stage}-user-subscriptions) DynamoDB table`);
}