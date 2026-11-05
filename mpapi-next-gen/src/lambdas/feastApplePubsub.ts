import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import {
	SQSClient,
	SendMessageCommand,
	SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { HTTPResponses } from '../common/apiGatewayHttp';
import type { AppleSubscriptionReference } from '../common/subscriptionReference';

// -----------------------------------------------------------------------------
// author: Pascal
// date: 25th October 2025
// We allow this temporarily, but there will be a future change to
// comply with Coding Directive 2.1
import { toDynamoEventAppleAsync, toSqsSubReference } from './applePubsub';
// -----------------------------------------------------------------------------

import type { StatusUpdateNotification } from '../common/pubsub-apple-common';
import { parsePayload } from '../common/pubsub-apple-common';
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

const defaultLogRequest = (request: APIGatewayProxyEvent): void =>
	console.log(`[34ef7aa3] ${JSON.stringify(request)}`);

const defaultStoreEventInDynamo = async (
	event: StatusUpdateNotification,
): Promise<void> => {
	const item = await toDynamoEventAppleAsync(event, true);
	const tableName = subscriptionEventsV2FullTableName();

	await dynamoDbClient.send(
		new PutItemCommand({
			TableName: tableName,
			Item: marshall(item, {
				removeUndefinedValues: true,
				convertClassInstanceToMap: true,
			}),
		}),
	);
};

export function buildHandler(
	sendMessageToSqs: (
		queueUrl: string,
		message: AppleSubscriptionReference,
		delaySeconds?: number,
	) => Promise<SendMessageCommandOutput> = sendToSqs,
	storeEventInDynamo: (
		event: StatusUpdateNotification,
	) => Promise<void> = defaultStoreEventInDynamo,
	logRequest: (request: APIGatewayProxyEvent) => void = defaultLogRequest,
): (request: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
	return async (request: APIGatewayProxyEvent) => {
		const secret = process.env.Secret;

		if (secret === undefined) {
			console.error("PubSub secret in env is 'undefined'");
			return HTTPResponses.INTERNAL_ERROR;
		}

		if (request.queryStringParameters?.secret === secret) {
			logRequest(request);

			const statusUpdateNotification = parsePayload(request.body);
			if (statusUpdateNotification instanceof Error) {
				return HTTPResponses.INVALID_REQUEST;
			}

			const appleSubscriptionReference = toSqsSubReference(
				statusUpdateNotification,
			);

			try {
				const queueUrl = process.env.QueueUrl;
				if (queueUrl === undefined) {
					throw new Error('No QueueUrl env parameter provided');
				}

				await Promise.all([
					sendMessageToSqs(queueUrl, appleSubscriptionReference),
					storeEventInDynamo(statusUpdateNotification),
				]);

				return HTTPResponses.OK;
			} catch (e) {
				console.error('Internal server error', e);
				return HTTPResponses.INTERNAL_ERROR;
			}
		} else {
			return HTTPResponses.UNAUTHORISED;
		}
	};
}

// -----------------------------------------------------------------------------
// Handler

export const handler = buildHandler();
