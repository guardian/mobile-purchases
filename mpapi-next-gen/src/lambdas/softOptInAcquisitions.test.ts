import { handler } from './softOptInAcquisitions';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import type { DynamoDBStreamEvent } from 'aws-lambda';

jest.mock('../common/guIdentityApi', () => ({
	getMembershipAccountId: jest.fn().mockResolvedValue('123456789012'),
	getIdentityApiKey: jest.fn().mockResolvedValue('mock-api-key'),
	getIdentityUrl: jest.fn().mockResolvedValue('https://mock-guardian.co.uk'),
}));

global.fetch = jest.fn().mockResolvedValue({
	ok: true,
	json: jest.fn().mockResolvedValue({
		user: { primaryEmailAddress: 'test-user@theguardian.com' },
	}),
});

jest.mock('aws-sdk/clients/sts', () => {
	return jest.fn().mockImplementation(() => ({
		assumeRole: jest.fn().mockReturnThis(),
		promise: jest.fn().mockResolvedValue({
			Credentials: {
				AccessKeyId: 'mock-access-key',
				SecretAccessKey: 'mock-secret-key',
				SessionToken: 'mock-session-token',
			},
		}),
	}));
});

jest.mock('aws-sdk/clients/sqs', () => {
	return jest.fn().mockImplementation(() => ({
		sendMessage: jest.fn().mockReturnThis(),
		promise: jest.fn().mockResolvedValue({ MessageId: 'mock-msg-id' }),
	}));
});

const dynamoMock = mockClient(DynamoDBClient);
const sqsMock = mockClient(SQSClient);

process.env.DLQUrl = 'https://amazonaws.com';
process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE = '1';

describe('DynamoDB Stream Handler - GetItem Unmarshalling Test', () => {
	beforeEach(() => {
		dynamoMock.reset();
		sqsMock.reset();
		jest.clearAllMocks();
	});

	const rawDynamoItem = {
		subscriptionId: { S: 'sub-123' },
		userId: { S: 'user-456' },
		platform: { S: 'IosFeast' },
		endTimestamp: { S: '2028-12-31T23:59:59.999Z' },
		startTimestamp: { S: '2026-01-01T00:00:00.000Z' },
	};

	const mockStreamEvent: DynamoDBStreamEvent = {
		Records: [
			{
				eventName: 'INSERT',
				dynamodb: {
					NewImage: {
						userId: { S: 'user-456' },
						subscriptionId: { S: 'sub-123' },
					},
				},
			},
		],
	};

	it('should successfully unmarshall raw DynamoDB attribute values and process active subscriptions', async () => {
		dynamoMock.on(GetItemCommand).resolves({
			Item: rawDynamoItem,
		});

		await expect(handler(mockStreamEvent)).resolves.not.toThrow();

		expect(dynamoMock.call(0).args[0].input).toEqual({
			TableName: 'mobile-purchases-CODE-subscriptions',
			Key: { subscriptionId: { S: 'sub-123' } },
		});

		const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
		const dlqCalls = sqsCalls.filter(
			(call) => call.args[0].input.QueueUrl === process.env.DLQUrl,
		);
		expect(dlqCalls.length).toBe(0);
	});

	it('should route the item to the Dead Letter Queue if the subscription record is missing', async () => {
		dynamoMock.on(GetItemCommand).resolves({
			Item: undefined,
		});

		await expect(handler(mockStreamEvent)).resolves.not.toThrow();

		const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
		const dlqCalls = sqsCalls.filter(
			(call) => call.args[0].input.QueueUrl === process.env.DLQUrl,
		);
		
		expect(dlqCalls.length).toBe(1);
		
		const messageBody = JSON.parse(dlqCalls[0].args[0].input.MessageBody as string);
		expect(messageBody).toMatchObject({
			subscriptionId: 'sub-123',
			identityId: 'user-456',
		});
	});
});
