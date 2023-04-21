import {DynamoDBRecord, DynamoDBStreamEvent} from "aws-lambda";
import { ReadUserSubscription, UserSubscription } from "../models/userSubscription";
import {Region, Stage} from "../utils/appIdentity";
import {dynamoMapper, putMetric, sendToSqsSoftOptIns} from "../utils/aws";
import {getMembershipAccountId} from "../utils/guIdentityApi";

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
	return event.Records.filter(dynamoEvent => {
		const oldImage = dynamoEvent.dynamodb?.OldImage;
		const newImage = dynamoEvent.dynamodb?.NewImage;

		return dynamoEvent.eventName === "MODIFY" &&
			(!oldImage?.cancellationTimestamp || oldImage?.cancellationTimestamp?.S === undefined) &&
			newImage?.cancellationTimestamp && newImage?.cancellationTimestamp?.S !== undefined;
	});
}

export function getUncancellationRecords(event: DynamoDBStreamEvent) {
	return event.Records.filter(dynamoEvent => {
		const oldImage = dynamoEvent.dynamodb?.OldImage;
		const newImage = dynamoEvent.dynamodb?.NewImage;

		return dynamoEvent.eventName === "MODIFY" &&
			oldImage?.cancellationTimestamp && oldImage?.cancellationTimestamp?.S !== undefined &&
			(!newImage?.cancellationTimestamp || newImage?.cancellationTimestamp?.S === undefined);
	});
}

export async function handler(
	event: DynamoDBStreamEvent,
) {
	try {
		const cancellationEvents = getCancellationRecords(event);
		const uncancellationEvents = getUncancellationRecords(event);

		console.log(`${cancellationEvents.length} cancellation events to process`);
		console.log(`${uncancellationEvents.length} uncancellation events to process`);

		const membershipAccountId = await getMembershipAccountId();
		const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

		for (const record of cancellationEvents) {
			const userSubscription = await getUserSubscription(record.dynamodb?.NewImage?.subscriptionId.S ?? '');

			await sendToSqsSoftOptIns(Stage === "PROD" ? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD` : `${queueNamePrefix}/soft-opt-in-consent-setter-queue-DEV`, {
				identityId: userSubscription.userId,
				eventType: "Cancellation",
				productName: "InAppPurchase"
			})
		}

		for (const record of uncancellationEvents) {
			const userSubscription = await getUserSubscription(record.dynamodb?.NewImage?.subscriptionId.S ?? '');

			await sendToSqsSoftOptIns(Stage === "PROD" ? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD` : `${queueNamePrefix}/soft-opt-in-consent-setter-queue-DEV`, {
				identityId: userSubscription.userId,
				eventType: "Acquisition",
				productName: "InAppPurchase"
			})
		}

		console.log(`Processed ${cancellationEvents.length} cancellation events`);
		console.log(`Processed ${uncancellationEvents.length} uncancellation events`);
	}
	catch (error) {
		console.log(error);
		console.log('Failed while processing cancelled subscriptions');
		await putMetric("failed_cancel_subscription_handler", 1);
	}
}
