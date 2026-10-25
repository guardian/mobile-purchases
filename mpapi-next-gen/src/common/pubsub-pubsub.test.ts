import { expect, test, describe, it, jest } from '@jest/globals';
import { HTTPResponses } from './apiGatewayHttp';
import { SubscriptionEvent } from './subscriptionEvent';
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
});
