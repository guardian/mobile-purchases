import { DynamoDBStreamEvent } from "aws-lambda";
import { ReadUserSubscription, UserSubscription } from "../models/userSubscription";
import { Stage } from "../utils/appIdentity";
import { dynamoMapper, putMetric, sendToSqs } from "../utils/aws";

async function getUserSubscription(subscriptionId: string): Promise<UserSubscription> {
    const userLinks = await dynamoMapper.query(ReadUserSubscription, {subscriptionId}, {indexName: "subscriptionId-userId"});
    const userSubscriptions = [];

    for await (const userLink of userLinks) {
        userSubscriptions.push(userLink);
    }

    if (userSubscriptions.length === 0){
        console.warn(`User Subscription not found for subscription ${subscriptionId}`);
        throw new Error(`User Subscription not found for subscription ${subscriptionId}`);
    }

    return userSubscriptions[0];
}

export async function handler(event: DynamoDBStreamEvent): Promise<any> {
    try {
        const cancellationEvents = event.Records.filter(dynamoEvent => {
            return dynamoEvent.eventName === "MODIFY" &&
            dynamoEvent.dynamodb?.NewImage?.cancellationTimestamp 
            && dynamoEvent.dynamodb.NewImage.cancellationTimestamp.N != null;
        });
    
        for (const cancellationEvent of cancellationEvents){
            const userSubscription = await getUserSubscription(cancellationEvent.dynamodb?.Keys?.subscriptionId.S ?? '')
            sendToSqs(`soft-opt-in-consent-setter-queue-${Stage}`, {
                identityId: userSubscription.userId,
                eventType: "Cancellation",
                productName: "InAppPurchase"
            })
        }
    }
    catch {
        console.log('Failed while processing cancelled subscriptions');
        await putMetric("failed_cancel_subscription_handler", 1);
    }
}