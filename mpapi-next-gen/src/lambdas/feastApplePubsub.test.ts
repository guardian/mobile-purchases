import '@jest/globals';
import type { StatusUpdateNotification } from '../common/pubsub-apple-common';
import { parsePayload } from '../common/pubsub-apple-common';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { buildHandler } from './feastApplePubsub';
import { HTTPResponses } from '../common/apiGatewayHttp';
import type { AppleSubscriptionReference } from '../common/subscriptionReference';
import { subscriptionEventsV2FullTableName } from '../common/subscriptionEvent';
import { expect, beforeEach, describe, it, jest } from '@jest/globals';

const sqsMock = mockClient(SQSClient);
const dynamoMock = mockClient(DynamoDBClient);

jest.mock('./applePubsub', () => {
	const actual = jest.requireActual('./applePubsub');
	return {
		...actual,
		toDynamoEventAppleAsync: jest.fn(),
	};
});

const buildApiGatewayEvent = (): APIGatewayProxyEvent => {
	const body: StatusUpdateNotification = {
		original_transaction_id: 'TEST',
		cancellation_date: 'TEST',
		web_order_line_item_id: 'TEST',
		auto_renew_adam_id: 'TEST',
		expiration_intent: 'TEST',
		auto_renew_product_id: 'uk.co.guardian.Feast.yearly',
		auto_renew_status: 'true',
		bid: 'uk.co.guardian.Feast',
		bvrs: 'TEST',
		environment: 'Sandbox',
		notification_type: 'INITIAL_BUY',
		unified_receipt: {
			environment: 'Sandbox',
			latest_receipt: 'TEST',
			latest_receipt_info: [
				{
					app_item_id: 'TEST',
					bvrs: 'TEST',
					is_in_intro_offer_period: 'false',
					is_trial_period: 'true',
					item_id: 'TEST',
					original_transaction_id: 'TEST',
					product_id: 'some.product.id',
					quantity: '1',
					transaction_id: 'TEST',
					unique_identifier: 'TEST',
					unique_vendor_identifier: 'TEST',
					version_external_identifier: 'TEST',
					web_order_line_item_id: 'TEST',
					purchase_date_ms: 'TEST',
					original_purchase_date_ms: 'TEST',
					expires_date: 'TEST',
					expires_date_ms: 'TEST',
				},
			],
			pending_renewal_info: [
				{
					auto_renew_product_id: 'uk.co.guardian.Feast.yearly',
					auto_renew_status: '1',
					original_transaction_id: 'TEST',
					product_id: 'uk.co.guardian.Feast.yearly',
					price_consent_status: '',
					price_increase_status: '',
				},
			],
			status: 0,
		},
		promotional_offer_id: 'promotional_offer_id',
		promotional_offer_name: 'promotional_offer_name',
		product_id: 'product_id',
		purchase_date_ms: 0,
		expires_date_ms: 0,
	};

	return {
		body: JSON.stringify(body),
		headers: {},
		multiValueHeaders: {},
		httpMethod: 'POST',
		isBase64Encoded: false,
		path: '',
		pathParameters: {},
		queryStringParameters: { secret: 'test_secret' },
		multiValueQueryStringParameters: {},
		// @ts-expect-error // keeping test fixtures small
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

describe('The Feast Apple pubsub', () => {
	it('Should return HTTP 200 and publish the event to SQS', async () => {
		const mockSqsFunction = jest.fn(
			(_queueurl: string, _event: AppleSubscriptionReference) =>
				Promise.resolve({} as never),
		);
		const input = buildApiGatewayEvent();
		const expectedSubscriptionReferenceInSqs = { receipt: 'TEST' };

		const noOpLogger = (_request: APIGatewayProxyEvent): void => {};
		const noOpStoreEventInDynamo = (
			_event: StatusUpdateNotification,
		): Promise<void> => Promise.resolve();
		const handler = buildHandler(
			mockSqsFunction,
			noOpStoreEventInDynamo,
			noOpLogger,
		);

		const result = await handler(input);

		expect(result).toStrictEqual(HTTPResponses.OK);
		expect(mockSqsFunction.mock.calls.length).toEqual(1);
		expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(
			expectedSubscriptionReferenceInSqs,
		);
	});

	it('Should return HTTP 401 if secret is invalid', async () => {
		const mockSqsFunction = jest.fn(
			(_queueurl: string, _event: AppleSubscriptionReference) =>
				Promise.resolve({} as never),
		);
		const input = buildApiGatewayEvent();
		input.queryStringParameters = {};

		const noOpLogger = (_request: APIGatewayProxyEvent): void => {};
		const noOpStoreEventInDynamo = jest.fn(
			(_event: StatusUpdateNotification): Promise<void> => Promise.resolve(),
		);
		const handler = buildHandler(
			mockSqsFunction,
			noOpStoreEventInDynamo,
			noOpLogger,
		);

		const result = await handler(input);

		expect(result).toStrictEqual(HTTPResponses.UNAUTHORISED);
		expect(mockSqsFunction).not.toHaveBeenCalled();
		expect(noOpStoreEventInDynamo).not.toHaveBeenCalled();
	});

	it('invokes the method to add the event to the Dynamo table', async () => {
		const input = buildApiGatewayEvent();
		const sendMessageToSqs = jest.fn(
			(_queueurl: string, _event: AppleSubscriptionReference) =>
				Promise.resolve({} as never),
		);
		const noOpLogger = (_request: APIGatewayProxyEvent): void => {};
		const storeEventInDynamoMock = jest.fn(
			(_parsedPayload: StatusUpdateNotification) => Promise.resolve(),
		);
		const handler = buildHandler(
			sendMessageToSqs,
			storeEventInDynamoMock,
			noOpLogger,
		);

		const result = await handler(input);
		const parsedPayload = parsePayload(input.body);

		if (parsedPayload instanceof Error) {
			throw parsedPayload;
		}

		expect(result).toStrictEqual(HTTPResponses.OK);
		expect(storeEventInDynamoMock).toHaveBeenCalledTimes(1);
		expect(storeEventInDynamoMock).toHaveBeenCalledWith(parsedPayload);
	});

	describe('AWS SDK v3 command construction (default implementations)', () => {
		beforeEach(() => {
			sqsMock.reset();
			dynamoMock.reset();
			process.env['QueueUrl'] = 'https://sqs.example/apple-queue';
			process.env['Secret'] = 'test_secret';
		});

		it('sends a SendMessageCommand with the Apple subscription reference as JSON body', async () => {
			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const noOpLogger = (_request: APIGatewayProxyEvent): void => {};
			const noOpStoreEventInDynamo = jest.fn(
				(_event: StatusUpdateNotification): Promise<void> => Promise.resolve(),
			);
			const handler = buildHandler(
				undefined,
				noOpStoreEventInDynamo,
				noOpLogger,
			);

			const result = await handler(buildApiGatewayEvent());

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = sqsMock.commandCalls(SendMessageCommand);
			expect(calls).toHaveLength(1);
			expect(calls[0].args[0].input).toStrictEqual({
				QueueUrl: 'https://sqs.example/apple-queue',
				MessageBody: JSON.stringify({ receipt: 'TEST' }),
				DelaySeconds: undefined,
			});
		});

		it('writes a PutItemCommand to the subscription-events-v2 table with a marshalled apple event', async () => {
			const { toDynamoEventAppleAsync } = jest.requireMock('./applePubsub') as {
				toDynamoEventAppleAsync: jest.Mock;
			};
			toDynamoEventAppleAsync.mockResolvedValue({
				subscriptionId: 'TEST',
				timestampAndType: '2025-10-25T12:00:00.000Z|INITIAL_BUY',
				date: '2025-10-25',
				timestamp: '2025-10-25T12:00:00.000Z',
				eventType: 'INITIAL_BUY',
				platform: 'ios-feast',
				appId: 'uk.co.guardian.Feast',
				freeTrial: false,
				applePayload: { notification_type: 'INITIAL_BUY' },
				googlePayload: null,
				ttl: 0,
				promotional_offer_id: 'promotional_offer_id',
				promotional_offer_name: 'promotional_offer_name',
				product_id: 'product_id',
				purchase_date_ms: 0,
				expires_date_ms: 0,
				extra: '',
			});

			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const mockSqsFunction = jest.fn(
				(_queueurl: string, _event: AppleSubscriptionReference) =>
					Promise.resolve({} as never),
			);
			const noOpLogger = (_request: APIGatewayProxyEvent): void => {};
			const handler = buildHandler(mockSqsFunction, undefined, noOpLogger);

			const result = await handler(buildApiGatewayEvent());

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = dynamoMock.commandCalls(PutItemCommand);
			expect(calls).toHaveLength(1);

			const input = calls[0].args[0].input;
			expect(input.TableName).toBe(subscriptionEventsV2FullTableName());
			expect(input.Item).toStrictEqual({
				subscriptionId: { S: 'TEST' },
				timestampAndType: { S: '2025-10-25T12:00:00.000Z|INITIAL_BUY' },
				date: { S: '2025-10-25' },
				timestamp: { S: '2025-10-25T12:00:00.000Z' },
				eventType: { S: 'INITIAL_BUY' },
				platform: { S: 'ios-feast' },
				appId: { S: 'uk.co.guardian.Feast' },
				freeTrial: { BOOL: false },
				applePayload: { M: { notification_type: { S: 'INITIAL_BUY' } } },
				googlePayload: { NULL: true },
				ttl: { N: '0' },
				promotional_offer_id: { S: 'promotional_offer_id' },
				promotional_offer_name: { S: 'promotional_offer_name' },
				product_id: { S: 'product_id' },
				purchase_date_ms: { N: '0' },
				expires_date_ms: { N: '0' },
				extra: { S: '' },
			});
		});
	});
});
