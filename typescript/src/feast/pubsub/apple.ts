import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { toDynamoEvent, toSqsSubReference } from '../../pubsub/apple';
import {
	StatusUpdateNotification,
	parsePayload,
} from '../../pubsub/apple-common';
import { AppleSubscriptionReference } from '../../models/subscriptionReference';
import Sqs from 'aws-sdk/clients/sqs';
import { dynamoMapper, sendToSqs } from '../../utils/aws';
import { AWSError } from 'aws-sdk';
import { PromiseResult } from 'aws-sdk/lib/request';
import { HTTPResponses } from '../../models/apiGatewayHttp';

const defaultLogRequest = (request: APIGatewayProxyEvent): void =>
	console.log(`[34ef7aa3] ${JSON.stringify(request)}`);

const defaultStoreEventInDynamo = (
	event: StatusUpdateNotification,
): Promise<void> => {
	const item = toDynamoEvent(event);
	return dynamoMapper.put({ item }).then((_) => undefined);
};

export function buildHandler(
	sendMessageToSqs: (
		queueUrl: string,
		message: AppleSubscriptionReference,
	) => Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> = sendToSqs,
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
				if (queueUrl === undefined)
					throw new Error('No QueueUrl env parameter provided');

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

export const handler = buildHandler();
