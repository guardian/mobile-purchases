import 'source-map-support/register';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import {
	UserSubscription,
	userSubscriptionsFullTableName,
} from '../common/userSubscription';
import { Region, Stage } from '../common/appIdentity';
import { getMembershipAccountId } from '../common/guIdentityApi';
import { mapPlatformToSoftOptInProductName } from '../common/softOptIns';
import {
	DynamoDBClient,
	QueryCommand,
	DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
	CloudWatchClient,
	PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';

// -----------------------------------------------------------------------------
// Types

interface HandlerResponse {
	recordCount: number;
	rowCount: number;
}

// -----------------------------------------------------------------------------
// Clients Initialization

const dynamoClient = new DynamoDBClient({ region: Region });
const sqsClient = new SQSClient({ region: Region });
const cloudWatchClient = new CloudWatchClient({ region: Region });

// -----------------------------------------------------------------------------
// Globals Variables

const userSubscriptionTableName = userSubscriptionsFullTableName();

// -----------------------------------------------------------------------------
// Functions

async function handleSoftOptInsError(message: string) {
	console.error(message);
	await putMetric('failed_to_send_cancellation_message', 1);
}

async function getUserLinks(
	subscriptionId: string,
): Promise<UserSubscription[]> {
	const userLinks: UserSubscription[] = [];

	const command = new QueryCommand({
		TableName: userSubscriptionTableName,
		IndexName: 'subscriptionId-userId',
		KeyConditionExpression: 'subscriptionId = :subscriptionId',
		ExpressionAttributeValues: {
			':subscriptionId': { S: subscriptionId },
		},
	});

	const response = await dynamoClient.send(command);

	if (response.Items) {
		for (const item of response.Items) {
			const userSubscription = new UserSubscription(
				item.userId?.S || '',
				item.subscriptionId?.S || '',
				item.creationTimestamp?.S || '',
			);
			userLinks.push(userSubscription);
		}
	}

	return userLinks;
}

async function putMetric(metricName: string, value: number) {
	try {
		const command = new PutMetricDataCommand({
			Namespace: 'MobilePurchases',
			MetricData: [
				{
					MetricName: metricName,
					Value: value,
					Unit: 'Count',
				},
			],
		});
		await cloudWatchClient.send(command);
	} catch (error) {
		console.error(`[451c3ca7] failed to put metric ${metricName}:`, error);
	}
}

async function deleteUserSubscription(
	userLinks: UserSubscription[],
): Promise<number> {
	let count = 0;
	const tableName = userSubscriptionsFullTableName();

	for (const userLink of userLinks) {
		try {
			const command = new DeleteItemCommand({
				TableName: tableName,
				Key: {
					userId: { S: userLink.userId },
					subscriptionId: { S: userLink.subscriptionId },
				},
			});
			await dynamoClient.send(command);
			count++;
		} catch (error) {
			console.error(`[59bea505] failed to delete user link:`, error);
		}
	}

	if (userLinks.length !== count) {
		console.warn(
			`[4a6b2399] queried ${userLinks.length} rows, but only deleted ${count}`,
		);
	}

	console.log(`Deleted ${count} rows`);
	return count;
}

async function sendToSqsSoftOptIns(queueUrl: string, messageBody: unknown) {
	const command = new SendMessageCommand({
		QueueUrl: queueUrl,
		MessageBody: JSON.stringify(messageBody),
	});
	await sqsClient.send(command);
}

async function disableSoftOptIns(
	userLinks: UserSubscription[],
	subscriptionId: string,
	platform: string | undefined,
) {
	const membershipAccountId = await getMembershipAccountId();
	const queueNamePrefix = `https://sqs.${Region}.amazonaws.com/${membershipAccountId}`;

	const user = userLinks[0];

	const queueName =
		Stage === 'PROD'
			? `${queueNamePrefix}/soft-opt-in-consent-setter-queue-PROD`
			: `${queueNamePrefix}/soft-opt-in-consent-setter-queue-CODE`;

	await sendToSqsSoftOptIns(queueName, {
		identityId: user.userId,
		eventType: 'Cancellation',
		productName: mapPlatformToSoftOptInProductName(platform),
		subscriptionId: subscriptionId,
	});
	console.log(
		`[e3541b9d] sent soft opt-in message for identityId ${user.userId}`,
	);
}

// -----------------------------------------------------------------------------
// Handler

export async function handler(
	event: DynamoDBStreamEvent,
): Promise<HandlerResponse> {
	const ttlEvents = event.Records.filter((dynamoEvent) => {
		return (
			dynamoEvent.eventName === 'REMOVE' &&
			dynamoEvent.userIdentity?.type === 'Service' &&
			dynamoEvent.userIdentity?.principalId === 'dynamodb.amazonaws.com' &&
			dynamoEvent.dynamodb?.OldImage?.subscriptionId?.S
		);
	});

	const subscriptions = ttlEvents.map((event) => event.dynamodb?.OldImage);

	let recordCount = 0;
	let rowCount = 0;
	let softOptInSuccessCount = 0;

	for (const subscription of subscriptions) {
		const subscriptionId = subscription?.subscriptionId?.S;

		if (!subscriptionId) {
			console.warn(
				`[72661f2e] skipping: Missing subscriptionId in subscription object`,
			);
			continue;
		}

		const userSubscriptions = await getUserLinks(subscriptionId);

		if (userSubscriptions.length === 0) {
			console.log(
				`[a3ad0327] no user links to delete for subscriptionId: ${subscriptionId}`,
			);
		} else {
			rowCount += await deleteUserSubscription(userSubscriptions);

			try {
				const platform = subscription?.platform?.S;
				await disableSoftOptIns(userSubscriptions, subscriptionId, platform);
				softOptInSuccessCount++;
			} catch (e) {
				await handleSoftOptInsError(
					`[ef3c101a] soft opt-in message send failed for subscriptionId: ${subscriptionId}. ${e}`,
				);
			}
		}

		recordCount++;
	}

	console.log(
		`[33ae2f4d] processed ${recordCount} records from dynamo stream to delete ${rowCount} rows`,
	);

	console.log(
		`[8fc7737d] processed ${recordCount} records from dynamo stream to disable soft opt-ins for ${softOptInSuccessCount} users`,
	);

	return {
		recordCount,
		rowCount,
	};
}
