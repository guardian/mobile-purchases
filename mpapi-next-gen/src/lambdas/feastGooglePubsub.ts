import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HTTPResponses } from '../common/apiGatewayHttp';
import type { SubscriptionEvent } from '../common/subscriptionEvent';
import type { GoogleSubscriptionReference } from '../common/subscriptionReference';
import type {
	GoogleSubscriptionMetaData,
	SubscriptionNotification,
} from '../common/pubsub-google-common';
import {
	fetchMetadata as defaultFetchMetadata,
	parsePayload,
	toDynamoEventGoogleAsync,
	toSqsSubReference,
} from '../common/pubsub-google-common';
import { Ignorable } from '../common/ignorable';
import {
	SQSClient,
	SendMessageCommand,
	SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { subscriptionEventsV2FullTableName } from '../common/subscriptionEvent';

// -----------------------------------------------------------------------------
// Globals

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

// -----------------------------------------------------------------------------
// Functions

function sendToSqs(
	queueUrl: string,
	event: unknown,
	delaySeconds?: number,
): Promise<SendMessageCommandOutput> {
	return sqsClient.send(
		new SendMessageCommand({
			QueueUrl: queueUrl,
			MessageBody: JSON.stringify(event),
			DelaySeconds: delaySeconds,
		}),
	);
}

const defaultStoreEventInDynamo = async (
	event: SubscriptionEvent,
): Promise<void> => {
	const tableName = subscriptionEventsV2FullTableName();

	await dynamoDbClient.send(
		new PutItemCommand({
			TableName: tableName,
			Item: marshall(event, {
				removeUndefinedValues: true,
				convertClassInstanceToMap: true,
			}),
		}),
	);
};

export function buildHandler(
	sendMessageToSqs: (
		queueUrl: string,
		message: GoogleSubscriptionReference,
		delaySeconds?: number,
	) => Promise<SendMessageCommandOutput> = sendToSqs,
	storeEventInDynamo: (
		event: SubscriptionEvent,
	) => Promise<void> = defaultStoreEventInDynamo,
	fetchMetadata: (
		notification: SubscriptionNotification,
	) => Promise<GoogleSubscriptionMetaData | undefined> = defaultFetchMetadata,
): (request: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
	return async (request: APIGatewayProxyEvent) => {
		const secret = process.env.Secret;

		if (secret === undefined) {
			console.error("pubSub secret in env is 'undefined'");
			return HTTPResponses.INTERNAL_ERROR;
		}

		if (request.queryStringParameters?.secret === secret) {
			console.log(`[9ec5ee1d] ${JSON.stringify(request)}`);
			console.log(`[ccdca271] ${request.body}`);
			const notification = parsePayload(request.body);
			if (notification instanceof Error) {
				console.log(
					'[f0d090ab] parsing the payload failed: ',
					notification.message,
				);
				return HTTPResponses.INVALID_REQUEST;
			} else if (notification instanceof Ignorable) {
				console.log('[69182f1d] ignoring event: ', notification.message);
				return HTTPResponses.OK;
			}

			try {
				const androidSubscriptionReference = toSqsSubReference(notification);
				const queueUrl = process.env.QueueUrl;
				if (queueUrl === undefined) {
					throw new Error('No QueueUrl env parameter provided');
				}

				const metaData = await fetchMetadata(notification);
				const dynamoEvent = await toDynamoEventGoogleAsync(
					notification,
					false,
					metaData,
				);

				await Promise.all([
					sendMessageToSqs(queueUrl, androidSubscriptionReference),
					storeEventInDynamo(dynamoEvent),
				]);
			} catch (e) {
				console.error('Internal server error', e);
				return HTTPResponses.INTERNAL_ERROR;
			}
			return HTTPResponses.OK;
		} else {
			return HTTPResponses.UNAUTHORISED;
		}
	};
}

// -----------------------------------------------------------------------------
// Handler

export const handler = buildHandler();
