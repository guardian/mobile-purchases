import '@jest/globals';
import { jest, expect, describe, it } from '@jest/globals';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { Platform } from '../../src/models/platform';
import { SubscriptionEmpty } from '../../src/models/subscription';
import { handler } from '../../src/user/user';
import { plusDays } from '../../src/utils/dates';
import * as dynamodbMapper from '@aws/dynamodb-data-mapper';

const TEST_SECRET = 'test_secret';

const mockedDynamoDBMapper = dynamodbMapper as unknown as {
	DataMapper: new () => { query: jest.Mock; batchGet: jest.Mock };
	setMockQuery: <T>(fn: (params: T) => AsyncIterable<T>) => void;
	setMockBatchGet: <T>(fn: (params: T) => AsyncIterable<T>) => void;
};

jest.mock('../../src/utils/ssmConfig', () => {
	return {
		getConfigValue: () => Promise.resolve(TEST_SECRET),
	};
});

jest.mock('@aws/dynamodb-data-mapper', () => {
	const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

	const queryFn = jest.fn();
	const batchGetFn = jest.fn();

	return Object.assign({}, actualDataMapper, {
		DataMapper: jest.fn().mockImplementation(() => ({
			query: queryFn,
			batchGet: batchGetFn,
		})),
		setMockQuery: (mockImplementation: (arg0: unknown) => unknown) => {
			queryFn.mockImplementation(async function* (params) {
				const iterator = mockImplementation(params);
				for await (const item of iterator as AsyncIterable<unknown>) {
					yield item;
				}
			});
		},
		setMockBatchGet: (mockImplementation: (arg0: unknown) => unknown) => {
			batchGetFn.mockImplementation(async function* (params) {
				const iterator = mockImplementation(params);
				for await (const item of iterator as AsyncIterable<unknown>) {
					yield item;
				}
			});
		},
	});
});

describe('The user subscriptions lambda', () => {
	it('returns the correct subscriptions for a user', async () => {
		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const userId = '123';
		const subscriptionId = '1';

		// Get the mock functions from the mocked module
		const { setMockQuery, setMockBatchGet } = mockedDynamoDBMapper;

		setMockQuery(async function* () {
			yield {
				userId,
				subscriptionId,
			};
		});

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = subscriptionId;
		sub.platform = Platform.IosFeast;
		sub.productId = 'product-id';
		sub.startTimestamp = new Date().toISOString();
		sub.endTimestamp = plusDays(new Date(), 35).toISOString();
		setMockBatchGet(async function* () {
			yield sub;
		});

		const event = buildApiGatewayEvent(userId);
		const response = await handler(event);

		expect(response.statusCode).toEqual(200);
		expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
		expect(mockDataMapper.batchGet).toHaveBeenCalledTimes(1);
		const data = JSON.parse(response.body);
		expect(data.subscriptions.length).toEqual(1);
		expect(data.subscriptions[0].subscriptionId).toEqual(subscriptionId);
		expect(data.subscriptions[0].valid).toEqual(true);
		expect(data.subscriptions[0].softOptInProductName).toEqual(
			'FeastInAppPurchase',
		);
		expect(data.subscriptions[0].platform).toEqual(Platform.IosFeast);
	});
});

const buildApiGatewayEvent = (userId: string): APIGatewayProxyEvent => {
	return {
		headers: {
			Authorization: `Bearer ${TEST_SECRET}`,
		},
		multiValueHeaders: {},
		httpMethod: 'POST',
		isBase64Encoded: false,
		path: '',
		pathParameters: { userId },
		queryStringParameters: {},
		multiValueQueryStringParameters: {},
		// @ts-expect-error // keeping the text fixtures simple
		requestContext: null,
		resource: '',
	};
};
