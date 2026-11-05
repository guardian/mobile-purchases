import { expect, test, describe, it, jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { HTTPResponses } from './apiGatewayHttp';
import { SubscriptionEvent } from './subscriptionEvent';

// author: Pascal
// date: 25 October
// To simplify things during the rewrite, I am going to let this file import
// from `lambdas/applePubsub`, but in a future PR, I am going to reorganize that
// to comply with Coding Directive 2.2
import {
	toDynamoEventAppleAsync as applePayloadToDynamo,
	toSqsSubReference as toAppleSqsEvent,
} from '../lambdas/applePubsub';
import type { StatusUpdateNotification } from './pubsub-apple-common';
import { parsePayload as parseApplePayload } from './pubsub-apple-common';

import { subscriptionEventsV2FullTableName } from './subscriptionEvent';
import type {
	GoogleSubscriptionMetaData,
	SubscriptionNotification,
} from './pubsub-google-common';
import {
	toDynamoEventGoogleAsync as googlePayloadToDynamo,
	parsePayload as parseGooglePayload,
	toSqsSubReference as toGoogleSqsEvent,
} from './pubsub-google-common';

import { parseStoreAndSend_async } from './pubsub-pubsub';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import type { SendMessageCommandOutput } from '@aws-sdk/client-sqs';

const sqsMock = mockClient(SQSClient);
const dynamoMock = mockClient(DynamoDBClient);

const buildValidGoogleEvent = (): APIGatewayProxyEvent => {
	const receivedEvent = {
		version: '1.0',
		packageName: 'com.guardian.debug',
		eventTimeMillis: '1503349566168',
		subscriptionNotification: {
			version: '1.0',
			notificationType: 4,
			purchaseToken: 'PURCHASE_TOKEN',
			subscriptionId: 'my.sku',
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
			'projects/guardian.co.uk:maximal-ceiling-820/subscriptions/mobile-pubsub-code',
	};
	return {
		queryStringParameters: { secret: 'MYSECRET' },
		body: JSON.stringify(body),
		headers: {},
		multiValueHeaders: {},
		httpMethod: 'POST',
		isBase64Encoded: false,
		path: '',
		pathParameters: {},
		multiValueQueryStringParameters: {},
		// @ts-expect-error // keeping the test fixtures small
		requestContext: null,
		resource: '',
	};
};

type GooglePayload = {
	version: string;
	packageName: string;
	eventTimeMillis: string;
	subscriptionNotification?: {
		version: string;
		notificationType: number;
		purchaseToken: string;
		subscriptionId: string;
	};
	voidedPurchaseNotification?: {
		purchaseToken: string;
		orderId: string;
		productType: number;
		refundType: number;
	};
};

beforeEach(() => {
	process.env['Secret'] = 'MYSECRET';
	process.env['QueueUrl'] = 'https://sqs.example/google-queue';
	sqsMock.reset();
	dynamoMock.reset();
});

describe('The google pubsub', () => {
	test('Should return HTTP 200 and store the correct data in dynamo (1)', () => {
		process.env['Secret'] = 'MYSECRET';
		process.env['QueueUrl'] = '';

		const mockStoreFunction = jest.fn((event: SubscriptionEvent) =>
			Promise.resolve(event),
		);

		const mockSqsFunction = jest.fn(
			(_queueUrl: string, _event: { purchaseToken: string }) =>
				Promise.resolve({
					MessageId: '123',
					$metadata: {},
				} as SendMessageCommandOutput),
		);

		const mockGoogleFetchMetadataFunction = jest.fn((_event: GooglePayload) =>
			Promise.resolve({ freeTrial: true }),
		);

		const receivedEvent = {
			version: '1.0',
			packageName: 'com.guardian.debug',
			eventTimeMillis: '1503349566168',
			subscriptionNotification: {
				version: '1.0',
				notificationType: 4,
				purchaseToken: 'PURCHASE_TOKEN',
				subscriptionId: 'my.sku',
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
				'projects/guardian.co.uk:maximal-ceiling-820/subscriptions/mobile-pubsub-code',
		};

		const input: APIGatewayProxyEvent = {
			queryStringParameters: { secret: 'MYSECRET' },
			body: JSON.stringify(body),
			headers: {},
			multiValueHeaders: {},
			httpMethod: 'POST',
			isBase64Encoded: false,
			path: '',
			pathParameters: {},
			multiValueQueryStringParameters: {},
			// @ts-expect-error // keeping test fixtures small
			requestContext: null,
			resource: '',
		};

		const expectedSubscriptionEventInDynamo: SubscriptionEvent =
			new SubscriptionEvent(
				'PURCHASE_TOKEN', // subscriptionId
				'2017-08-21T21:06:06.168Z|SUBSCRIPTION_PURCHASED', // timestampAndType
				'2017-08-21', // date
				'2017-08-21T21:06:06.168Z', // timestamp
				'SUBSCRIPTION_PURCHASED', // eventType
				'android', // platform
				'com.guardian.debug', // appId
				true, // freeTrial
				{
					eventTimeMillis: '1503349566168',
					packageName: 'com.guardian.debug',
					subscriptionNotification: {
						notificationType: 4,
						purchaseToken: 'PURCHASE_TOKEN',
						subscriptionId: 'my.sku',
						version: '1.0',
					},
					version: '1.0',
				}, // googlePayload
				null, // applePayload
				1582319167, // ttl
				null, // promotional_offer_id
				null, // promotional_offer_name
				'my.sku', // product_id
				undefined, // purchase_date_ms
				undefined, // expires_date_ms
				'', // extra
			);

		const expectedSubscriptionReferenceInSqs = {
			packageName: 'com.guardian.debug',
			purchaseToken: 'PURCHASE_TOKEN',
			subscriptionId: 'my.sku',
		};

		return parseStoreAndSend_async(
			input,
			parseGooglePayload,
			(
				notification: SubscriptionNotification,
				metaData?: GoogleSubscriptionMetaData,
			) => googlePayloadToDynamo(notification, false, metaData),
			toGoogleSqsEvent,
			mockGoogleFetchMetadataFunction,
			mockStoreFunction,
			mockSqsFunction,
		).then((result) => {
			expect(result).toStrictEqual(HTTPResponses.OK);
			expect(mockStoreFunction.mock.calls.length).toEqual(1);
			expect(mockStoreFunction.mock.calls[0][0]).toStrictEqual(
				expectedSubscriptionEventInDynamo,
			);
			expect(mockSqsFunction.mock.calls.length).toEqual(1);
			expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(
				expectedSubscriptionReferenceInSqs,
			);
			expect(mockGoogleFetchMetadataFunction.mock.calls.length).toEqual(1);
			expect(mockGoogleFetchMetadataFunction.mock.calls[0][0]).toStrictEqual(
				receivedEvent,
			);
		});
	});

	it('returns a 400 response if the payload parsing fails', async () => {
		process.env['Secret'] = 'MYSECRET';
		process.env['QueueUrl'] = '';

		const mockStoreFunction = jest.fn((event: SubscriptionEvent) =>
			Promise.resolve(event),
		);
		const mockSqsFunction = jest.fn(
			(_queueUrl: string, _event: { purchaseToken: string }) =>
				Promise.resolve({
					MessageId: '123',
					$metadata: {},
				} as SendMessageCommandOutput),
		);
		const mockGoogleFetchMetadataFunction = jest.fn((_event: GooglePayload) =>
			Promise.resolve({ freeTrial: true }),
		);

		const receivedEvent = { foo: 'bar' };
		const encodedEvent = Buffer.from(JSON.stringify(receivedEvent)).toString(
			'base64',
		);
		const badPayload = {
			message: {
				data: encodedEvent,
				messageId: '123',
				message_id: '123',
				publishTime: '2019-05-24T15:06:47.701Z',
				publish_time: '2019-05-24T15:06:47.701Z',
			},
			subscription:
				'projects/guardian.co.uk:maximal-ceiling-820/subscriptions/mobile-pubsub-code',
		};
		const input: APIGatewayProxyEvent = {
			queryStringParameters: { secret: 'MYSECRET' },
			body: JSON.stringify(badPayload),
			headers: {},
			multiValueHeaders: {},
			httpMethod: 'POST',
			isBase64Encoded: false,
			path: '',
			pathParameters: {},
			multiValueQueryStringParameters: {},
			// @ts-expect-error // keeping the test fixtures small
			requestContext: null,
			resource: '',
		};

		const result = await parseStoreAndSend_async(
			input,
			parseGooglePayload,
			(
				notification: SubscriptionNotification,
				metaData?: GoogleSubscriptionMetaData,
			) => googlePayloadToDynamo(notification, false, metaData),
			toGoogleSqsEvent,
			mockGoogleFetchMetadataFunction,
			mockStoreFunction,
			mockSqsFunction,
		);

		expect(result).toEqual(HTTPResponses.INVALID_REQUEST);
	});

	it('returns a 200 response but does not do anything with a voided purchase notification', async () => {
		process.env['Secret'] = 'MYSECRET';
		process.env['QueueUrl'] = '';

		const mockStoreFunction = jest.fn((event: SubscriptionEvent) =>
			Promise.resolve(event),
		);
		const mockSqsFunction = jest.fn(
			(_queueUrl: string, _event: { purchaseToken: string }) =>
				Promise.resolve({
					MessageId: '123',
					$metadata: {},
				} as SendMessageCommandOutput),
		);
		const mockGoogleFetchMetadataFunction = jest.fn((_event: GooglePayload) =>
			Promise.resolve({ freeTrial: true }),
		);

		const receivedEvent = {
			version: '1.0',
			packageName: 'com.guardian.debug',
			eventTimeMillis: '1503349566168',
			voidedPurchaseNotification: {
				purchaseToken: 'PURCHASE_TOKEN',
				orderId: 'GS.0000-0000-0000',
				productType: 1,
				refundType: 1,
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
				'projects/guardian.co.uk:maximal-ceiling-820/subscriptions/mobile-pubsub-code',
		};
		const input: APIGatewayProxyEvent = {
			queryStringParameters: { secret: 'MYSECRET' },
			body: JSON.stringify(body),
			headers: {},
			multiValueHeaders: {},
			httpMethod: 'POST',
			isBase64Encoded: false,
			path: '',
			pathParameters: {},
			multiValueQueryStringParameters: {},
			// @ts-expect-error // keeping the test fixtures small
			requestContext: null,
			resource: '',
		};

		const result = await parseStoreAndSend_async(
			input,
			parseGooglePayload,
			(
				notification: SubscriptionNotification,
				metaData?: GoogleSubscriptionMetaData,
			) => googlePayloadToDynamo(notification, false, metaData),
			toGoogleSqsEvent,
			mockGoogleFetchMetadataFunction,
			mockStoreFunction,
			mockSqsFunction,
		);

		expect(result).toEqual(HTTPResponses.OK);
	});

	describe('AWS SDK v3 command construction (default implementations)', () => {
		const knownDynamoEvent = new SubscriptionEvent(
			'PURCHASE_TOKEN',
			'2025-10-25T12:00:00.000Z|SUBSCRIPTION_PURCHASED',
			'2025-10-25',
			'2025-10-25T12:00:00.000Z',
			'SUBSCRIPTION_PURCHASED',
			'android',
			'com.guardian.debug',
			true,
			{
				version: '1.0',
				packageName: 'com.guardian.debug',
				eventTimeMillis: '1503349566168',
				subscriptionNotification: {
					version: '1.0',
					notificationType: 4,
					purchaseToken: 'PURCHASE_TOKEN',
					subscriptionId: 'my.sku',
				},
			},
			null,
			0,
			null,
			null,
			'my.sku',
			undefined,
			undefined,
			'',
		);

		it('sends a SendMessageCommand with the Google subscription reference as JSON body', async () => {
			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const result = await parseStoreAndSend_async(
				buildValidGoogleEvent(),
				parseGooglePayload,
				(_notification, _metaData) => Promise.resolve(knownDynamoEvent),
				toGoogleSqsEvent,
				() => Promise.resolve({ freeTrial: true }),
				undefined,
				undefined,
			);

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = sqsMock.commandCalls(SendMessageCommand);
			expect(calls).toHaveLength(1);
			expect(calls[0].args[0].input).toStrictEqual({
				QueueUrl: 'https://sqs.example/google-queue',
				MessageBody: JSON.stringify({
					packageName: 'com.guardian.debug',
					purchaseToken: 'PURCHASE_TOKEN',
					subscriptionId: 'my.sku',
				}),
				DelaySeconds: undefined,
			});
		});

		it('writes a PutItemCommand to the subscription-events-v2 table with a marshalled event', async () => {
			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const result = await parseStoreAndSend_async(
				buildValidGoogleEvent(),
				parseGooglePayload,
				(_notification, _metaData) => Promise.resolve(knownDynamoEvent),
				toGoogleSqsEvent,
				() => Promise.resolve({ freeTrial: true }),
				undefined,
				undefined,
			);

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = dynamoMock.commandCalls(PutItemCommand);
			expect(calls).toHaveLength(1);

			const input = calls[0].args[0].input;
			expect(input.TableName).toBe(subscriptionEventsV2FullTableName());
			expect(input.Item).toBeDefined();
			expect(input.Item).toMatchObject({
				subscriptionId: { S: 'PURCHASE_TOKEN' },
				platform: { S: 'android' },
				appId: { S: 'com.guardian.debug' },
				freeTrial: { BOOL: true },
				product_id: { S: 'my.sku' },
			});
		});
	});
});

describe('The apple pubsub', () => {
	test('Should return HTTP 200 and store the correct data in dynamo (2)', () => {
		process.env['Secret'] = 'MYSECRET';
		process.env['QueueUrl'] = '';

		const mockStoreFunction = jest.fn((event: SubscriptionEvent) =>
			Promise.resolve(event),
		);

		const mockSqsFunction = jest.fn(
			(_queueUrl: string, _event: { receipt: string }) =>
				Promise.resolve({
					MessageId: '123',
					$metadata: {},
				} as SendMessageCommandOutput),
		);
		const mockAppleFetchMetadataFunction = jest.fn(
			(_event: StatusUpdateNotification) => Promise.resolve(undefined),
		);

		const body: StatusUpdateNotification = {
			original_transaction_id: 'TEST',
			cancellation_date: 'TEST',
			web_order_line_item_id: 'TEST',
			auto_renew_adam_id: 'TEST',
			expiration_intent: 'TEST',
			auto_renew_product_id:
				'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
			auto_renew_status: 'true',
			bid: 'uk.co.guardian.iphone2',
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
						product_id: 'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
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
						auto_renew_product_id:
							'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
						auto_renew_status: '1',
						original_transaction_id: 'TEST',
						product_id: 'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
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

		const input: APIGatewayProxyEvent = {
			queryStringParameters: { secret: 'MYSECRET' },
			body: JSON.stringify(body),
			headers: {},
			multiValueHeaders: {},
			httpMethod: 'POST',
			isBase64Encoded: false,
			path: '',
			pathParameters: {},
			multiValueQueryStringParameters: {},
			// @ts-expect-error // keeping test fixtures small
			requestContext: null,
			resource: '',
		};

		const expectedSubscriptionEventInDynamo: Partial<SubscriptionEvent> = {
			subscriptionId: 'TEST',
			eventType: 'INITIAL_BUY',
			platform: 'ios',
			appId: 'uk.co.guardian.iphone2',
			freeTrial: true,
			googlePayload: null,
			applePayload: {
				original_transaction_id: 'TEST',
				cancellation_date: 'TEST',
				web_order_line_item_id: 'TEST',
				auto_renew_adam_id: 'TEST',
				expiration_intent: 'TEST',
				auto_renew_product_id:
					'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
				auto_renew_status: 'true',
				bid: 'uk.co.guardian.iphone2',
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
							product_id: 'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
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
							auto_renew_product_id:
								'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
							auto_renew_status: '1',
							original_transaction_id: 'TEST',
							product_id: 'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
						},
					],
					status: 0,
				},
			},
		};

		const expectedSubscriptionReferenceInSqs = { receipt: 'TEST' };

		return parseStoreAndSend_async(
			input,
			parseApplePayload,
			(notification) => applePayloadToDynamo(notification, false),
			toAppleSqsEvent,
			mockAppleFetchMetadataFunction,
			mockStoreFunction,
			mockSqsFunction,
		).then((result) => {
			expect(result).toStrictEqual(HTTPResponses.OK);
			expect(mockStoreFunction.mock.calls.length).toEqual(1);
			expect(mockStoreFunction.mock.calls[0][0]).toMatchObject(
				expectedSubscriptionEventInDynamo,
			);
			expect(mockSqsFunction.mock.calls.length).toEqual(1);
			expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(
				expectedSubscriptionReferenceInSqs,
			);
			expect(mockAppleFetchMetadataFunction.mock.calls.length).toEqual(1);
		});
	});
	describe('AWS SDK v3 command construction (default implementations)', () => {
		const knownAppleDynamoEvent = new SubscriptionEvent(
			'TEST',
			'2025-10-25T12:00:00.000Z|INITIAL_BUY',
			'2025-10-25',
			'2025-10-25T12:00:00.000Z',
			'INITIAL_BUY',
			'ios',
			'uk.co.guardian.iphone2',
			true,
			null,
			{ notification_type: 'INITIAL_BUY' },
			0,
			null,
			null,
			'product_id',
			0,
			0,
			'',
		);

		const buildValidAppleEvent = (): APIGatewayProxyEvent => {
			const body: StatusUpdateNotification = {
				original_transaction_id: 'TEST',
				cancellation_date: 'TEST',
				web_order_line_item_id: 'TEST',
				auto_renew_adam_id: 'TEST',
				expiration_intent: 'TEST',
				auto_renew_product_id:
					'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
				auto_renew_status: 'true',
				bid: 'uk.co.guardian.iphone2',
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
							product_id: 'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
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
							auto_renew_product_id:
								'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
							auto_renew_status: '1',
							original_transaction_id: 'TEST',
							product_id: 'uk.co.guardian.gla.12months.2018Dec.withFreeTrial',
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
				queryStringParameters: { secret: 'MYSECRET' },
				body: JSON.stringify(body),
				headers: {},
				multiValueHeaders: {},
				httpMethod: 'POST',
				isBase64Encoded: false,
				path: '',
				pathParameters: {},
				multiValueQueryStringParameters: {},
				// @ts-expect-error // keeping the test fixtures small
				requestContext: null,
				resource: '',
			};
		};

		it('sends a SendMessageCommand with the Apple subscription reference as JSON body', async () => {
			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const result = await parseStoreAndSend_async(
				buildValidAppleEvent(),
				parseApplePayload,
				(_notification) => Promise.resolve(knownAppleDynamoEvent),
				toAppleSqsEvent,
				() => Promise.resolve(undefined),
				undefined,
				undefined,
			);

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = sqsMock.commandCalls(SendMessageCommand);
			expect(calls).toHaveLength(1);
			expect(calls[0].args[0].input).toStrictEqual({
				QueueUrl: 'https://sqs.example/google-queue',
				MessageBody: JSON.stringify({ receipt: 'TEST' }),
				DelaySeconds: undefined,
			});
		});

		it('writes a PutItemCommand to the subscription-events-v2 table with a marshalled apple event', async () => {
			sqsMock.on(SendMessageCommand).resolves({ MessageId: 'msg-1' });
			dynamoMock.on(PutItemCommand).resolves({});

			const result = await parseStoreAndSend_async(
				buildValidAppleEvent(),
				parseApplePayload,
				(_notification) => Promise.resolve(knownAppleDynamoEvent),
				toAppleSqsEvent,
				() => Promise.resolve(undefined),
				undefined,
				undefined,
			);

			expect(result).toStrictEqual(HTTPResponses.OK);

			const calls = dynamoMock.commandCalls(PutItemCommand);
			expect(calls).toHaveLength(1);

			const input = calls[0].args[0].input;
			expect(input.TableName).toBe(subscriptionEventsV2FullTableName());
			expect(input.Item).toBeDefined();
			expect(input.Item).toMatchObject({
				subscriptionId: { S: 'TEST' },
				platform: { S: 'ios' },
				appId: { S: 'uk.co.guardian.iphone2' },
				freeTrial: { BOOL: true },
				eventType: { S: 'INITIAL_BUY' },
			});
		});
	});
});
