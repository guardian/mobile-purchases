import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { HTTPResponses } from './apiGatewayHttp';
import type { SubscriptionEvent } from './subscriptionEvent';
import { subscriptionEventFullTableName } from './subscriptionEvent';
import type { Option } from './option';
import { Ignorable } from './ignorable';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
	SQSClient,
	SendMessageCommand,
	type SendMessageCommandOutput,
} from '@aws-sdk/client-sqs';

const dynamoDbClient = new DynamoDBClient({});
const sqsClient = new SQSClient({});

export const ONE_YEAR_IN_SECONDS = 31557600;

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

async function catchingServerErrors(
	block: () => Promise<APIGatewayProxyResult>,
): Promise<APIGatewayProxyResult> {
	try {
		return await block();
	} catch (e) {
		console.error('Internal server error', e);
		return HTTPResponses.INTERNAL_ERROR;
	}
}

async function storeInDynamoImpl(
	event: SubscriptionEvent,
): Promise<SubscriptionEvent> {
	const tableName = subscriptionEventFullTableName();

	await dynamoDbClient.send(
		new PutItemCommand({
			TableName: tableName,
			Item: marshall(event, {
				removeUndefinedValues: true,
				convertClassInstanceToMap: true,
			}),
		}),
	);

	return event;
}

export async function parseStoreAndSend_async<Payload, SqsEvent, MetaData>(
	request: APIGatewayProxyEvent,
	parsePayload: (body: Option<string>) => Payload | Ignorable | Error,
	toDynamoEvent: (
		payload: Payload,
		metaData?: MetaData,
	) => Promise<SubscriptionEvent>,
	toSqsEvent: (payload: Payload) => SqsEvent,
	fetchMetadata: (payload: Payload) => Promise<MetaData | undefined>,
	storeInDynamo: (
		event: SubscriptionEvent,
	) => Promise<SubscriptionEvent> = storeInDynamoImpl,
	sendToSqsFunction: (
		queueUrl: string,
		event: SqsEvent,
		delaySeconds?: number,
	) => Promise<SendMessageCommandOutput> = sendToSqs,
): Promise<APIGatewayProxyResult> {
	const secret = process.env.Secret;
	return catchingServerErrors(async () => {
		if (secret === undefined) {
			console.error("PubSub secret in env is 'undefined'");
			return HTTPResponses.INTERNAL_ERROR;
		}
		if (request.queryStringParameters?.secret === secret) {
			console.log(`[6e2c7935] ${JSON.stringify(request)}`);
			console.log(`[b8099bec] ${request.body}`);
			const notification = parsePayload(request.body);
			console.log(`[e13c6557] ${JSON.stringify(notification)}`);
			if (notification instanceof Error) {
				console.log(
					'[52bd8bf0] parsing the payload failed: ',
					notification.message,
				);
				return HTTPResponses.INVALID_REQUEST;
			} else if (notification instanceof Ignorable) {
				console.log('[4b6a3593] ignoring event: ', notification.message);
				return HTTPResponses.OK;
			}

			const queueUrl = process.env.QueueUrl;
			if (queueUrl === undefined) {
				throw new Error('No QueueUrl env parameter provided');
			}

			const metaData = await fetchMetadata(notification);
			const dynamoEvent = await toDynamoEvent(notification, metaData);
			const dynamoPromise = storeInDynamo(dynamoEvent);
			const sqsEvent = toSqsEvent(notification);
			const sqsPromise = sendToSqsFunction(queueUrl, sqsEvent);

			return Promise.all([sqsPromise, dynamoPromise])
				.then((_value) => HTTPResponses.OK)
				.catch((error) => {
					console.error('Unable to process event' + notification, error);
					return HTTPResponses.INTERNAL_ERROR;
				});
		} else {
			return HTTPResponses.UNAUTHORISED;
		}
	});
}
