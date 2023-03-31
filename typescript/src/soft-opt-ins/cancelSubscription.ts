import { DynamoDBStreamEvent } from "aws-lambda";
import { ReadUserSubscription, UserSubscription } from "../models/userSubscription";
import { Stage } from "../utils/appIdentity";
import { dynamoMapper, putMetric, sendToSqs } from "../utils/aws";

async function getUserSubscription(subscriptionId: string): Promise<UserSubscription> {
	const userLinks = await dynamoMapper.query(ReadUserSubscription, { subscriptionId }, { indexName: "subscriptionId-userId" });
	const userSubscriptions = [];

	for await (const userLink of userLinks) {
		userSubscriptions.push(userLink);
	}

	if (userSubscriptions.length === 0) {
		console.warn(`User Subscription not found for subscription ${subscriptionId}`);
		throw new Error(`User Subscription not found for subscription ${subscriptionId}`);
	}

	return userSubscriptions[0];
}

export function getCancellationRecords(event: DynamoDBStreamEvent) {
	return event.Records.filter(dynamoEvent => dynamoEvent.eventName === "MODIFY" &&
			dynamoEvent.dynamodb?.NewImage?.cancellationTimestamp
			&& dynamoEvent.dynamodb.NewImage.cancellationTimestamp.N != null);
}

export async function handler(
	event: DynamoDBStreamEvent,
) {
	try {
		const cancellationEvents = getCancellationRecords(event);

		for (const cancellationEvent of cancellationEvents) {
			const userSubscription = await getUserSubscription(cancellationEvent.dynamodb?.NewImage?.subscriptionId.S ?? '')
			sendToSqs(Stage ===  "PROD" ? `soft-opt-in-consent-setter-queue-PROD`: `soft-opt-in-consent-setter-queue-DEV`, {
				identityId: userSubscription.userId,
				eventType: "Cancellation",
				productName: "InAppPurchase"
			})
		}
	}
	catch (error) {
		console.log(error);
		console.log('Failed while processing cancelled subscriptions');
		await putMetric("failed_cancel_subscription_handler", 1);
	}
}
