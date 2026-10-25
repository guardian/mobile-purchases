import '@jest/globals';
import { jest, expect, describe, it, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { Platform } from '../common/platform';
import { handler } from './userSubscriptions';
import { plusDays } from '../common/dates';
import { mockClient } from 'aws-sdk-client-mock';
import {
	DynamoDBClient,
	QueryCommand,
	BatchGetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { getParameterValueUsingAppStageStackConvention } from '../common/ssmParameters';
import { getAuthToken } from '../common/guIdentityApi';

const TEST_SECRET = 'test_secret';
const ddbMock = mockClient(DynamoDBClient);

// Mock SSM Parameter utility paths
jest.mock('../common/ssmParameters', () => ({
	getParameterValueUsingAppStageStackConvention: jest.fn(),
}));

// Mock Identity utilities to align authorization hooks
jest.mock('../common/guIdentityApi', () => ({
	getAuthToken: jest.fn(),
	getUserId: jest.fn(),
}));

describe('The user subscriptions lambda', () => {
	beforeEach(() => {
		ddbMock.reset();
		jest.clearAllMocks();

		// Configure SSM secret matches to pass handler verification loops
		(
			getParameterValueUsingAppStageStackConvention as jest.Mock
		).mockImplementation((paramName) => {
			if (paramName === 'user.api-key.0') return Promise.resolve(TEST_SECRET);
			if (paramName === 'user.api-key.1.salesforce')
				return Promise.resolve('salesforce-key');
			return Promise.resolve('');
		});

		// Extract Authorization headers correctly
		(getAuthToken as jest.Mock).mockImplementation((headers: any) => {
			const auth = headers?.Authorization || headers?.authorization;
			return auth ? auth.replace('Bearer ', '') : undefined;
		});
	});

	it('returns the correct subscriptions for a user using native v3 SDK clients', async () => {
		const userId = '123';
		const subscriptionId = '1';
		const nowStr = new Date().toISOString();
		const endStr = plusDays(new Date(), 35).toISOString();

		// 1. Mock QueryCommand to return subscription mappings
		ddbMock.on(QueryCommand).resolves({
			Items: [
				{
					userId: { S: userId },
					subscriptionId: { S: subscriptionId },
				},
			],
		});

		// 2. Mock BatchGetItemCommand to hydrate full subscription models
		ddbMock.on(BatchGetItemCommand).resolves({
			Responses: {
				// The handler maps table targets using subscriptionsFullTableName()
				'mobile-purchases-CODE-subscriptions': [
					{
						subscriptionId: { S: subscriptionId },
						platform: { S: Platform.IosFeast },
						productId: { S: 'product-id' },
						startTimestamp: { S: nowStr },
						endTimestamp: { S: endStr },
						autoRenewing: { BOOL: true },
					},
				],
			},
		});

		const event = buildApiGatewayEvent(userId);
		const response = await handler(event);

		// Assertions matching HTTP profiles
		expect(response.statusCode).toEqual(200);

		// Confirm standard v3 commands were dispatched exactly once
		expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(1);
		expect(ddbMock.commandCalls(BatchGetItemCommand)).toHaveLength(1);

		const data = JSON.parse(response.body);
		expect(data.subscriptions.length).toEqual(1);
		expect(data.subscriptions[0].subscriptionId).toEqual(subscriptionId);
		expect(data.subscriptions[0].valid).toEqual(true);
		expect(data.subscriptions[0].softOptInProductName).toEqual(
			'FeastInAppPurchase',
		);
		expect(data.subscriptions[0].platform).toEqual(Platform.IosFeast);
	});

	it('should cleanly batch partition chunks when subscription array limits exceed 100 entries', async () => {
		const userId = 'user-batch-100';
		const mockIds = Array.from({ length: 150 }, (_, i) => `sub-${i}`);
		const nowStr = new Date().toISOString();
		const endStr = plusDays(new Date(), 35).toISOString();

		ddbMock.on(QueryCommand).resolves({
			Items: mockIds.map((id) => ({
				userId: { S: userId },
				subscriptionId: { S: id },
			})),
		});

		ddbMock
			.on(BatchGetItemCommand)
			.resolvesOnce({
				Responses: {
					'mobile-purchases-CODE-subscriptions': mockIds
						.slice(0, 100)
						.map((id) => ({
							subscriptionId: { S: id },
							platform: { S: Platform.IosFeast },
							productId: { S: 'product-id' },
							startTimestamp: { S: nowStr },
							endTimestamp: { S: endStr },
							autoRenewing: { BOOL: true },
						})),
				},
			})
			.resolvesOnce({
				Responses: {
					'mobile-purchases-CODE-subscriptions': mockIds
						.slice(100)
						.map((id) => ({
							subscriptionId: { S: id },
							platform: { S: Platform.IosFeast },
							productId: { S: 'product-id' },
							startTimestamp: { S: nowStr },
							endTimestamp: { S: endStr },
							autoRenewing: { BOOL: true },
						})),
				},
			});

		const event = buildApiGatewayEvent(userId);
		const response = await handler(event);

		expect(response.statusCode).toEqual(200);
		expect(ddbMock.commandCalls(BatchGetItemCommand)).toHaveLength(2);

		const data = JSON.parse(response.body);
		expect(data.subscriptions).toHaveLength(150);
	});

	it('should continuously cycle and retry evaluations when BatchGetItem responses return UnprocessedKeys maps', async () => {
		const userId = 'user-retry-unprocessed';
		const nowStr = new Date().toISOString();
		const endStr = plusDays(new Date(), 35).toISOString();

		ddbMock.on(QueryCommand).resolves({
			Items: [
				{ userId: { S: userId }, subscriptionId: { S: 'sub-part-1' } },
				{ userId: { S: userId }, subscriptionId: { S: 'sub-part-2' } },
			],
		});

		ddbMock
			.on(BatchGetItemCommand)
			.resolvesOnce({
				Responses: {
					'mobile-purchases-CODE-subscriptions': [
						{
							subscriptionId: { S: 'sub-part-1' },
							platform: { S: Platform.IosFeast },
							productId: { S: 'product-id' },
							startTimestamp: { S: nowStr },
							endTimestamp: { S: endStr },
							autoRenewing: { BOOL: true },
						},
					],
				},
				UnprocessedKeys: {
					'mobile-purchases-CODE-subscriptions': {
						Keys: [{ subscriptionId: { S: 'sub-part-2' } }],
					},
				},
			})
			.resolvesOnce({
				Responses: {
					'mobile-purchases-CODE-subscriptions': [
						{
							subscriptionId: { S: 'sub-part-2' },
							platform: { S: Platform.IosFeast },
							productId: { S: 'product-id' },
							startTimestamp: { S: nowStr },
							endTimestamp: { S: endStr },
							autoRenewing: { BOOL: true },
						},
					],
				},
				UnprocessedKeys: {},
			});

		const event = buildApiGatewayEvent(userId);
		const response = await handler(event);

		expect(response.statusCode).toEqual(200);
		expect(ddbMock.commandCalls(BatchGetItemCommand)).toHaveLength(2);

		const data = JSON.parse(response.body);
		expect(data.subscriptions).toHaveLength(2);
		expect(data.subscriptions.map((s: any) => s.subscriptionId)).toContain(
			'sub-part-1',
		);
		expect(data.subscriptions.map((s: any) => s.subscriptionId)).toContain(
			'sub-part-2',
		);
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
		// @ts-expect-error keeping mock items minimal
		requestContext: null,
		resource: '',
	};
};
