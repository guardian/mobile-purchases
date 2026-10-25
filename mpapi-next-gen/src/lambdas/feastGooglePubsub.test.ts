import type { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { buildHandler } from './feastGooglePubsub';
import { HTTPResponses } from '../common/apiGatewayHttp';
import {
	SubscriptionEvent,
	subscriptionEventsV2FullTableName,
} from '../common/subscriptionEvent';
import type { GoogleSubscriptionReference } from '../common/subscriptionReference';
import { expect, beforeEach, jest, describe, it } from '@jest/globals';

const sqsMock = mockClient(SQSClient);
const dynamoMock = mockClient(DynamoDBClient);

const buildApiGatewayEvent = (secret: string): APIGatewayProxyEvent => {
	const receivedEvent = {
		version: '1.0',
		packageName: 'uk.co.guardian.feast',
		eventTimeMillis: '1503349566168',
		subscriptionNotification: {
			version: '1.0',
			notificationType: 4,
			purchaseToken: 'PURCHASE_TOKEN',
			subscriptionId: 'uk.co.guardian.feast.access.test',
		},
	};

	const encodedEvent = Buffer.from(JSON.stringify(receivedEvent)).toString(
		'base64',
	);

	const body = {
		message: {
			data: encodedEvent,
			messageId: '123',
			message_id: '123',
			publishTime: '2019-05-24T15:06:47.701Z',
			publish_time: '2019-05-24T15:06:47.701Z',
		},
		subscription:
			'projects/guardian.co.uk/subscriptions/feast-in-app-subscription-test',
	};

	return {
		body: JSON.stringify(body),
		headers: {},
		multiValueHeaders: {},
		httpMethod: 'POST',
		isBase64Encoded: false,
		path: '',
		pathParameters: {},
		queryStringParameters: { secret: secret },
		multiValueQueryStringParameters: {},
		// @ts-expect-error // keeping the test fixtures small
		requestContext: null,
		resource: '',
	};
};

beforeEach(() => {
	process.env['QueueUrl'] = '';
	process.env['Secret'] = 'test_secret';
	sqsMock.reset();
	dynamoMock.reset();
});

describe('The Feast Google pubsub', () => {
	it('Should return HTTP 200 if secret is correct and input is valid', async () => {
		const correctSecret = 'test_secret';
		const input = buildApiGatewayEvent(correctSecret);

		const noOpStoreEventInDynamo = (_event: SubscriptionEvent): Promise<void> =>
			Promise.resolve();
		const mockSqsFunction = jest.fn(
			(_queueurl: string, _event: GoogleSubscriptionReference) =>
				Promise.resolve({} as never),
		);
		const mockFetchMetadataFunction = jest.fn((_event: unknown) =>
			Promise.resolve({ freeTrial: true }),
		);
		const handler = buildHandler(
			mockSqsFunction,
			noOpStoreEventInDynamo,
			mockFetchMetadataFunction,
		);

		const result = await handler(input);

		expect(result).toStrictEqual(HTTPResponses.OK);
	});

	it('Should return HTTP 401 if secret is incorrect', async () => {
		const incorrectSecret = 'incorrect_secret';
		const input = buildApiGatewayEvent(incorrectSecret);

		const noOpStoreEventInDynamo = jest.fn(
			(_event: SubscriptionEvent): Promise<void> => Promise.resolve(),
		);
		const mockSqsFunction = jest.fn(
			(_queueurl: string, _event: GoogleSubscriptionReference) =>
				Promise.resolve({} as never),
		);
		const mockFetchMetadataFunction = jest.fn((_event: unknown) =>
			Promise.resolve({ freeTrial: true }),
		);
		const handler = buildHandler(
			mockSqsFunction,
			noOpStoreEventInDynamo,
			mockFetchMetadataFunction,
		);

		const result = await handler(input);

		expect(result).toStrictEqual(HTTPResponses.UNAUTHORISED);
		expect(mockSqsFunction).not.toHaveBeenCalled();
		expect(noOpStoreEventInDynamo).not.toHaveBeenCalled();
	});

	it('invokes the method to add the event to the Dynamo table', async () => {
		const correctSecret = 'test_secret';
		const input = buildApiGatewayEvent(correctSecret);

		const mockSqsFunction = jest.fn(
			(_queueurl: string, _event: GoogleSubscriptionReference) =>
				Promise.resolve({} as never),
		);
		const storeEventInDynamoMock = jest.fn((_event: SubscriptionEvent) =>
			Promise.resolve(),
		);
		const mockFetchMetadataFunction = jest.fn((_event: unknown) =>
			Promise.resolve({ freeTrial: true }),
		);
		const handler = buildHandler(
			mockSqsFunction,
			storeEventInDynamoMock,
			mockFetchMetadataFunction,
		);

		const result = await handler(input);

		const expectedSubscriptionEventInDynamo: SubscriptionEvent =
			new SubscriptionEvent(
				'PURCHASE_TOKEN',
				'2017-08-21T21:06:06.168Z|SUBSCRIPTION_PURCHASED',
				'2017-08-21',
				'2017-08-21T21:06:06.168Z',
				'SUBSCRIPTION_PURCHASED',
				'android-feast',
				'uk.co.guardian.feast',
				true,
				{
					eventTimeMillis: '1503349566168',
					packageName: 'uk.co.guardian.feast',
					subscriptionNotification: {
						notificationType: 4,
						purchaseToken: 'PURCHASE_TOKEN',
						subscriptionId: 'uk.co.guardian.feast.access.test',
						version: '1.0',
					},
					version: '1.0',
				},
				null,
				1582319167,
				null,
				null,
				'uk.co.guardian.feast.access.test',
				undefined,
				undefined,
				'',
			);

		expect(result).toStrictEqual(HTTPResponses.OK);
		expect(storeEventInDynamoMock).toHaveBeenCalledTimes(1);
		expect(storeEventInDynamoMock).toHaveBeenCalledWith(
			expectedSubscriptionEventInDynamo,
		);
	});

	it('Should publish data to SQS queue', async () => {
		const correctSecret = 'test_secret';
		const input = buildApiGatewayEvent(correctSecret);
		const expectedSubscriptionReferenceInSqs = {
			packageName: 'uk.co.guardian.feast',
			purchaseToken: 'PURCHASE_TOKEN',
			subscriptionId: 'uk.co.guardian.feast.access.test',
		};

		const noOpStoreEventInDynamo = (_event: SubscriptionEvent): Promise<void> =>
			Promise.resolve();
		const mockSqsFunction = jest.fn(
			(_queueurl: string, _event: GoogleSubscriptionReference) =>
				Promise.resolve({} as never),
		);
		const mockFetchMetadataFunction = jest.fn((_event: unknown) =>
			Promise.resolve({ freeTrial: true }),
		);
		const handler = buildHandler(
			mockSqsFunction,
			noOpStoreEventInDynamo,
			mockFetchMetadataFunction,
		);

		const result = await handler(input);

		expect(result).toStrictEqual(HTTPResponses.OK);
		expect(mockSqsFunction.mock.calls.length).toEqual(1);
		expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(
			expectedSubscriptionReferenceInSqs,
		);
	});

	describe('AWS SDK v3 command construction (default implementations)', () => {
		beforeEach(() => {
			sqsMock.reset();
			dynamoMock.reset();
			process.env['QueueUrl'] = 'https://sqs.example/feast-queue';
			process.env['Secret'] = 'test_secret';
		});

		it('sends a SendMessageCommand with the parsed subscription reference as JSON body', async () => {
			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const noOpStoreEventInDynamo = (
				_event: SubscriptionEvent,
			): Promise<void> => Promise.resolve();
			const mockFetchMetadataFunction = jest.fn((_event: unknown) =>
				Promise.resolve({ freeTrial: true }),
			);
			const handler = buildHandler(
				undefined,
				noOpStoreEventInDynamo,
				mockFetchMetadataFunction,
			);

			const result = await handler(buildApiGatewayEvent('test_secret'));

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = sqsMock.commandCalls(SendMessageCommand);
			expect(calls).toHaveLength(1);
			expect(calls[0].args[0].input).toStrictEqual({
				QueueUrl: 'https://sqs.example/feast-queue',
				MessageBody: JSON.stringify({
					packageName: 'uk.co.guardian.feast',
					purchaseToken: 'PURCHASE_TOKEN',
					subscriptionId: 'uk.co.guardian.feast.access.test',
				}),
				DelaySeconds: undefined,
			});
		});

		it('writes a PutItemCommand to the subscription-events-v2 table with a marshalled SubscriptionEvent', async () => {
			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const mockSqsFunction = jest.fn(
				(_queueurl: string, _event: GoogleSubscriptionReference) =>
					Promise.resolve({} as never),
			);
			const mockFetchMetadataFunction = jest.fn((_event: unknown) =>
				Promise.resolve({ freeTrial: true }),
			);
			const handler = buildHandler(
				mockSqsFunction,
				undefined,
				mockFetchMetadataFunction,
			);

			const result = await handler(buildApiGatewayEvent('test_secret'));

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = dynamoMock.commandCalls(PutItemCommand);
			expect(calls).toHaveLength(1);

			const input = calls[0].args[0].input;
			expect(input.TableName).toBe(subscriptionEventsV2FullTableName());
			expect(input.Item).toBeDefined();
			expect(input.Item).toMatchObject({
				subscriptionId: { S: 'PURCHASE_TOKEN' },
				timestampAndType: {
					S: '2017-08-21T21:06:06.168Z|SUBSCRIPTION_PURCHASED',
				},
				date: { S: '2017-08-21' },
				timestamp: { S: '2017-08-21T21:06:06.168Z' },
				eventType: { S: 'SUBSCRIPTION_PURCHASED' },
				platform: { S: 'android-feast' },
				appId: { S: 'uk.co.guardian.feast' },
				freeTrial: { BOOL: true },
			});
		});
	});
});
