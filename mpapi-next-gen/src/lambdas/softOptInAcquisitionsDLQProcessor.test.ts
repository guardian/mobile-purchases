import 'source-map-support/register';
import * as dlqProcessor from './softOptInAcquisitionsDLQProcessor';
import {
	expect,
	jest,
	describe,
	beforeEach,
	afterEach,
	test,
	it,
} from '@jest/globals';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
	SQSClient,
	ReceiveMessageCommand,
	DeleteMessageCommand,
	SendMessageCommand,
} from '@aws-sdk/client-sqs';
import { STSClient, AssumeRoleCommand } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';

// -----------------------------------------------------------------------------
// Mocks

const dynamoMock = mockClient(DynamoDBClient);
const sqsMock = mockClient(SQSClient);
const stsMock = mockClient(STSClient);

jest.mock('../common/guIdentityApi', () => ({
	getMembershipAccountId: jest.fn(() => Promise.resolve('123456789012')),
	getIdentityApiKey: jest.fn(() => Promise.resolve('mock-api-key')),
	getIdentityUrl: jest.fn(() =>
		Promise.resolve('https://identity.example.com'),
	),
}));
jest.mock('@jest/globals');

// -----------------------------------------------------------------------------
// Test

describe('messageIsOneDayOld() function', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2023-03-14').getTime());
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('Return true if message is older than one day', () => {
		const timestamp = 1676194220000;
		expect(dlqProcessor.messageIsOneDayOld(timestamp)).toStrictEqual(true);
	});

	test('Return false if message is not older than one day', () => {
		const timestamp = 1686648235000;
		expect(dlqProcessor.messageIsOneDayOld(timestamp)).toStrictEqual(false);
	});
});

describe('handler', () => {
	let originalFetch: typeof fetch;

	beforeEach(() => {
		process.env.DLQUrl = 'https://example.com';
		jest.clearAllMocks();

		dynamoMock.reset();
		sqsMock.reset();
		stsMock.reset();

		// Mock the credentials payload response from STS to satisfy the AWS client auth check
		stsMock.on(AssumeRoleCommand).resolves({
			Credentials: {
				AccessKeyId: 'mockAccessKeyId',
				SecretAccessKey: 'mockSecretAccessKey',
				SessionToken: 'mockSessionToken',
				Expiration: new Date(Date.now() + 3600000),
			},
		});

		// Ensure SQS writes don't fail internally during execution passes
		sqsMock.on(SendMessageCommand).resolves({ MessageId: 'mock-msg-id' });

		// Stub out the global native fetch engine instead of the local library import package
		originalFetch = global.fetch;
		global.fetch = jest.fn().mockImplementation(() =>
			Promise.resolve({
				ok: true,
				json: () =>
					Promise.resolve({
						user: { primaryEmailAddress: 'test@example.com' },
					}),
			} as Response),
		);

		jest.useFakeTimers();
		jest.setSystemTime(new Date('2023-03-14').getTime());
	});

	afterEach(() => {
		jest.useRealTimers();
		global.fetch = originalFetch;
	});

	it('should not delete message', async () => {
		// Simulate a missing subscription record in the DynamoDB table.
		// When the item is missing, the code catches it and breaks the loop processing
		// without deleting the message.
		dynamoMock.on(GetItemCommand).resolves({
			Item: undefined,
		});

		let receiveMessageCallCount = 0;
		sqsMock.on(ReceiveMessageCommand).callsFake(() => {
			receiveMessageCallCount++;
			if (receiveMessageCallCount > 1) {
				return { Messages: [] };
			} else {
				return {
					Messages: [
						{
							MessageId: 'testId',
							ReceiptHandle: 'testReceiptHandle',
							MD5OfBody: 'md5body',
							Body: JSON.stringify({
								subscriptionId: '12345',
								identityId: 'identityId',
								timestamp: 1976194220000,
							}),
						},
					],
				};
			}
		});

		await dlqProcessor.handler({});

		const firstDynamoCall = dynamoMock.call(0);
		expect(firstDynamoCall).toBeDefined();
		expect(firstDynamoCall.firstArg.input).toEqual({
			TableName: 'mobile-purchases-CODE-subscriptions',
			Key: { subscriptionId: { S: '12345' } },
		});

		expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(0);
		expect(sqsMock.commandCalls(ReceiveMessageCommand)).toHaveLength(2);
	});

	it('should delete expired message', async () => {
		let receiveMessageCallCount = 0;
		sqsMock.on(ReceiveMessageCommand).callsFake(() => {
			receiveMessageCallCount++;
			if (receiveMessageCallCount > 1) {
				return { Messages: [] };
			} else {
				return {
					Messages: [
						{
							MessageId: 'testId',
							ReceiptHandle: 'testReceiptHandle',
							MD5OfBody: 'md5body',
							Body: JSON.stringify({
								subscriptionId: '12345',
								identityId: 'identityId',
								timestamp: 1676194220000,
							}),
						},
					],
				};
			}
		});

		sqsMock.on(DeleteMessageCommand).resolves({});

		await dlqProcessor.handler({});

		expect(sqsMock.commandCalls(ReceiveMessageCommand)).toHaveLength(2);
		expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(1);
	});

	it('should delete successful message', async () => {
		// Mock an active subscription so that processAcquisition completes happily
		dynamoMock.on(GetItemCommand).resolves({
			Item: {
				subscriptionId: { S: '12345' },
				startTimestamp: { S: '2023-03-01 07:24:38 UTC' },
				endTimestamp: { S: '2025-03-01 07:24:38 UTC' },
			},
		});

		let receiveMessageCallCount = 0;
		sqsMock.on(ReceiveMessageCommand).callsFake(() => {
			receiveMessageCallCount++;
			if (receiveMessageCallCount > 1) {
				return { Messages: [] };
			} else {
				return {
					Messages: [
						{
							MessageId: 'testId',
							ReceiptHandle: 'testReceiptHandle',
							MD5OfBody: 'md5body',
							Body: JSON.stringify({
								subscriptionId: '12345',
								identityId: 'identityId',
								timestamp: 1976194220000,
							}),
						},
					],
				};
			}
		});

		sqsMock.on(DeleteMessageCommand).resolves({});

		await dlqProcessor.handler({});

		const firstDynamoCall = dynamoMock.call(0);
		expect(firstDynamoCall).toBeDefined();
		expect(firstDynamoCall.firstArg.input).toEqual({
			TableName: 'mobile-purchases-CODE-subscriptions',
			Key: { subscriptionId: { S: '12345' } },
		});

		expect(sqsMock.commandCalls(ReceiveMessageCommand)).toHaveLength(2);
		expect(sqsMock.commandCalls(DeleteMessageCommand)).toHaveLength(1);
	});
});
