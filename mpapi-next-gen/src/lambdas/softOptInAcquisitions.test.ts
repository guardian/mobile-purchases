import 'source-map-support/register';
import { handler } from './softOptInAcquisitions';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import type { DynamoDBStreamEvent } from 'aws-lambda';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';

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

const dynamoMock = mockClient(DynamoDBClient);
const sqsMock = mockClient(SQSClient);
const stsMock = mockClient(STSClient);

process.env.DLQUrl = 'https://amazonaws.com';

describe('DynamoDB Stream Handler - GetItem Unmarshalling Test', () => {
	beforeEach(() => {
		dynamoMock.reset();
		sqsMock.reset();
		stsMock.reset();
		jest.clearAllMocks();

		stsMock.on(AssumeRoleCommand).resolves({
			Credentials: {
				AccessKeyId: 'mock-access-key',
				SecretAccessKey: 'mock-secret-key',
				SessionToken: 'mock-session-token',
				Expiration: new Date(Date.now() + 3600 * 1000),
			},
		});

		sqsMock.on(SendMessageCommand).resolves({
			MessageId: 'mock-msg-id',
		});
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

		const firstDynamoCall = dynamoMock.call(0);
		expect(firstDynamoCall.args[0].input).toEqual({
			TableName: 'mobile-purchases-CODE-subscriptions',
			Key: { subscriptionId: { S: 'sub-123' } },
		});

		// Verify total standard SQS messages sent is 2 (Soft Opt-In queue + Braze queue)
		expect(sqsMock.calls().length).toBe(2);

		// 1. First SQS Call should be the Soft Opt-In consent setter message
		const firstCommand = sqsMock.call(0).args[0] as unknown as {
			input: Record<string, any>;
		};
		expect(firstCommand.input).toEqual(
			expect.objectContaining({
				QueueUrl:
					'https://sqs.eu-west-1.amazonaws.com/123456789012/soft-opt-in-consent-setter-queue-CODE',
				MessageBody: expect.stringContaining('"subscriptionId":"sub-123"'),
			}),
		);

		// 2. Second SQS Call should be the Braze email payload message
		const secondCommand = sqsMock.call(1).args[0] as unknown as {
			input: Record<string, any>;
		};
		expect(secondCommand.input).toEqual(
			expect.objectContaining({
				QueueUrl:
					'https://sqs.eu-west-1.amazonaws.com/123456789012/braze-emails-CODE',
				MessageBody: expect.stringContaining(
					'"Address":"test-user@theguardian.com"',
				),
			}),
		);

		// 3. Double-check that none of these calls were routed to the DLQ in this test path
		const dlqCalls = sqsMock.calls().filter((call) => {
			const cmd = call.args[0] as unknown as { input: Record<string, any> };
			return cmd.input?.QueueUrl === process.env.DLQUrl;
		});
		expect(dlqCalls.length).toBe(0);
	});

	it('should route the item to the Dead Letter Queue if the subscription record is missing', async () => {
		dynamoMock.on(GetItemCommand).resolves({
			Item: undefined,
		});

		await expect(handler(mockStreamEvent)).resolves.not.toThrow();

		const sqsCalls = sqsMock.calls();
		const dlqCalls = sqsCalls.filter((call) => {
			const commandInstance = call.args[0] as unknown as {
				input: Record<string, any>;
			};
			return commandInstance.input?.QueueUrl === process.env.DLQUrl;
		});

		expect(dlqCalls.length).toBe(1);

		const standardCommand = dlqCalls[0].args[0] as unknown as {
			input: Record<string, any>;
		};
		const messageBody = JSON.parse(standardCommand.input.MessageBody as string);
		expect(messageBody).toMatchObject({
			subscriptionId: 'sub-123',
			identityId: 'user-456',
		});
	});
});
