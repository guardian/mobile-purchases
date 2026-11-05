import { handler } from './feastAcquisitionEventsRouter';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { Platform } from '../common/platform';
import type { DynamoDBStreamEvent } from 'aws-lambda';

const dynamoMock = mockClient(DynamoDBClient);
const sqsMock = mockClient(SQSClient);

jest.mock('../common/subscription', () => ({
	subscriptionsFullTableName: jest.fn(
		() => 'mobile-purchases-CODE-subscriptions',
	),
}));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Feast Acquisition Events Router Lambda Integration', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		dynamoMock.reset();
		sqsMock.reset();

		process.env.MobileAccountId = '123456789012';
		process.env.Stage = 'CODE';
		process.env.AWS_REGION = 'eu-west-1';
	});

	const createMockStreamEvent = (
		eventName: string,
		subscriptionId?: string,
	): DynamoDBStreamEvent => ({
		Records: [
			{
				eventID: 'mock-event-id',
				eventName: eventName,
				eventVersion: '1.1',
				eventSource: 'aws:dynamodb',
				awsRegion: 'eu-west-1',
				dynamodb: {
					NewImage: subscriptionId
						? {
								userId: { S: 'identity-user-123' },
								subscriptionId: { S: subscriptionId },
							}
						: {
								userId: { S: 'identity-user-123' },
							},
					StreamViewType: 'NEW_IMAGE',
				},
			},
		],
	});

	it('should accurately query GetItem and dispatch to the correct SQS queue matching Apple Feast structures', async () => {
		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 10);

		dynamoMock.on(GetItemCommand).resolves({
			Item: {
				subscriptionId: { S: 'apple-tx-sub-777' },
				endTimestamp: { S: futureDate.toISOString() },
				platform: { S: Platform.IosFeast },
			},
		});

		const event = createMockStreamEvent('INSERT', 'apple-tx-sub-777');

		await handler(event);

		const ddbCalls = dynamoMock.commandCalls(GetItemCommand);
		expect(ddbCalls).toHaveLength(1);
		expect(ddbCalls[0].args[0].input).toEqual({
			TableName: 'mobile-purchases-CODE-subscriptions',
			Key: {
				subscriptionId: { S: 'apple-tx-sub-777' },
			},
		});

		const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
		expect(sqsCalls).toHaveLength(1);
		expect(sqsCalls[0].args[0].input).toEqual({
			QueueUrl:
				'https://sqs.eu-west-1.amazonaws.com/123456789012/mobile-purchases-CODE-feast-apple-acquisition-events-queue',
			MessageBody: JSON.stringify({
				subscriptionId: 'apple-tx-sub-777',
				endTimestamp: futureDate.toISOString(),
				platform: Platform.IosFeast,
			}),
			DelaySeconds: undefined,
		});
	});

	it('should accurately query GetItem and dispatch to the correct SQS queue matching Google Feast structures', async () => {
		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 5);

		dynamoMock.on(GetItemCommand).resolves({
			Item: {
				subscriptionId: { S: 'google-tx-sub-888' },
				endTimestamp: { S: futureDate.toISOString() },
				platform: { S: Platform.AndroidFeast },
			},
		});

		const event = createMockStreamEvent('INSERT', 'google-tx-sub-888');

		await handler(event);

		const ddbCalls = dynamoMock.commandCalls(GetItemCommand);
		expect(ddbCalls).toHaveLength(1);

		const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
		expect(sqsCalls).toHaveLength(1);
		expect(sqsCalls[0].args[0].input).toEqual({
			QueueUrl:
				'https://sqs.eu-west-1.amazonaws.com/123456789012/mobile-purchases-CODE-feast-google-acquisition-events-queue',
			MessageBody: JSON.stringify({
				subscriptionId: 'google-tx-sub-888',
				endTimestamp: futureDate.toISOString(),
				platform: Platform.AndroidFeast,
			}),
			DelaySeconds: undefined,
		});
	});

	it('should cleanly execute a skip path logic when eventName is a non-INSERT type', async () => {
		const event = createMockStreamEvent('MODIFY', 'apple-tx-sub-777');

		await handler(event);

		expect(dynamoMock.commandCalls(GetItemCommand)).toHaveLength(0);
		expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
	});

	it('should cleanly execute a skip path logic when subscription records map out as a non-Feast platform', async () => {
		const futureDate = new Date();
		futureDate.setDate(futureDate.getDate() + 15);

		dynamoMock.on(GetItemCommand).resolves({
			Item: {
				subscriptionId: { S: 'standard-news-sub-999' },
				endTimestamp: { S: futureDate.toISOString() },
				platform: { S: 'android' },
			},
		});

		const event = createMockStreamEvent('INSERT', 'standard-news-sub-999');

		await handler(event);

		expect(dynamoMock.commandCalls(GetItemCommand)).toHaveLength(1);
		expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
	});

	it('should cleanly execute a skip path logic when subscription record is missing or not found in database', async () => {
		dynamoMock.on(GetItemCommand).resolves({
			Item: undefined,
		});

		const event = createMockStreamEvent('INSERT', 'ghost-sub-id-000');

		await handler(event);

		expect(dynamoMock.commandCalls(GetItemCommand)).toHaveLength(1);
		expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
	});

	it('should cleanly execute a skip path logic when a record timestamp marks an inactive subscription beyond grace limits', async () => {
		const historicalExpiredDate = new Date();
		historicalExpiredDate.setDate(historicalExpiredDate.getDate() - 45);

		dynamoMock.on(GetItemCommand).resolves({
			Item: {
				subscriptionId: { S: 'expired-sub-555' },
				endTimestamp: { S: historicalExpiredDate.toISOString() },
				platform: { S: Platform.IosFeast },
			},
		});

		const event = createMockStreamEvent('INSERT', 'expired-sub-555');

		await handler(event);

		expect(dynamoMock.commandCalls(GetItemCommand)).toHaveLength(1);
		expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(0);
	});
});
