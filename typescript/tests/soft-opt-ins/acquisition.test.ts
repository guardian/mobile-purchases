import type { DynamoDBStreamEvent } from 'aws-lambda';
import {
	expect,
	jest,
	describe,
	beforeEach,
	afterEach,
	it,
	test,
} from '@jest/globals';
import { Platform } from '../../src/models/platform';
import { SubscriptionEmpty } from '../../src/models/subscription';
import { handler } from '../../src/soft-opt-ins/acquisitions';
import { isPostAcquisition } from '../../src/soft-opt-ins/processSubscription';
import * as dynamodbMapper from '@aws/dynamodb-data-mapper';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import fetch from 'node-fetch';

// Typed mock for DynamoDB Mapper
const mockedDynamoDBMapper = dynamodbMapper as unknown as {
	DataMapper: new () => {
		batchPut: jest.Mock;
		get: jest.Mock;
		put: jest.Mock;
		delete: jest.Mock;
		query: jest.Mock;
		scan: jest.Mock;
		update: jest.Mock;
	};
	setMockGet: (fn: (arg0: unknown) => unknown) => void;
};

jest.mock('@aws/dynamodb-data-mapper', () => {
	const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

	const getFn = jest.fn();

	return Object.assign({}, actualDataMapper, {
		DataMapper: jest.fn().mockImplementation(() => ({
			batchPut: jest.fn(),
			get: getFn,
			put: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
			delete: jest.fn(),
			query: jest.fn(),
			scan: jest.fn(),
			update: jest.fn(),
		})),
		setMockGet: (mockImplementation: (arg0: unknown) => unknown) => {
			getFn.mockImplementation(async (params) => {
				return mockImplementation(params);
			});
		},
	});
});

// mock so imports don't use real client which throws an error as credentials are needed
jest.mock('@aws-sdk/client-dynamodb', () => jest.fn());
jest.mock('@aws-sdk/client-s3', () => jest.fn());
jest.mock('@aws-sdk/client-ssm', () => jest.fn());

jest.mock('node-fetch', () => jest.fn());

jest.mock('../../src/utils/guIdentityApi');
jest.mock('@aws-sdk/client-cloudwatch', () => jest.fn());

jest.mock('util', () => jest.fn());

jest.mock('@aws-sdk/client-sqs', () => {
	const mockSQS = {
		send: jest.fn(),
	};

	return {
		__esModule: true,
		SQSClient: jest.fn(() => mockSQS),
		SendMessageCommand: jest.fn(),
	};
});

jest.mock('@aws-sdk/client-sts', () => {
	const mockSTS = {
		assumeRole: jest.fn().mockReturnValue({
			promise: jest.fn().mockImplementation(() =>
				Promise.resolve({
					Credentials: {
						AccessKeyId: 'mockAccessKeyId',
						SecretAccessKey: 'mockSecretAccessKey',
						SessionToken: 'mockSessionToken',
					},
				}),
			),
		}),
	};

	return jest.fn(() => mockSTS);
});

jest.mock('@aws-sdk/credential-providers', () => ({
	fromIni: jest.fn(),
	fromTemporaryCredentials: jest.fn(),
}));

describe('isPostAcquisition() function', () => {
	beforeEach(() => {
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2023-03-14').getTime());
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	test('Return true if acquisition was more than two days ago', () => {
		const startTimestamp = '2023-03-01 07:24:38 UTC';
		expect(isPostAcquisition(startTimestamp)).toStrictEqual(true);
	});

	test('Return false if acquisition was less than two days ago', () => {
		const startTimestamp = '2023-03-13 07:24:38 UTC';
		expect(isPostAcquisition(startTimestamp)).toStrictEqual(false);
	});
});

describe('handler', () => {
	beforeEach(() => {
		process.env.DLQUrl = 'https://example.com';
		jest.clearAllMocks();

		jest.useFakeTimers();
		jest.setSystemTime(new Date('2023-03-14').getTime());
	});

	afterEach(() => {
		jest.useRealTimers();
		(fetch as unknown as jest.Mock).mockReset();
	});

	it('should process an acquisition correctly', async () => {
		const event: DynamoDBStreamEvent = {
			Records: [
				{
					eventName: 'INSERT',
					dynamodb: {
						NewImage: {
							subscriptionId: { S: '12345' },
							userId: { S: '67890' },
						},
					},
				},
			],
		};

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-14 07:24:38 UTC';
		sub.endTimestamp = '2023-03-14 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		await handler(event);

		expect(mockDataMapper.get).toHaveBeenCalledTimes(1);

		const subEmpty = new SubscriptionEmpty();
		subEmpty.setSubscriptionId('12345');
		expect(mockDataMapper.get).toHaveBeenCalledWith(subEmpty);

		expect(mockSQSClient.send).toHaveBeenCalledTimes(1);

		const expectedSendMessageParams = {
			QueueUrl: `https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/soft-opt-in-consent-setter-queue-CODE`,
			MessageBody: JSON.stringify({
				identityId: '67890',
				eventType: 'Acquisition',
				productName: 'InAppPurchase',
				subscriptionId: '12345',
			}),
		};

		expect(mockSQSClient.send).toHaveBeenCalledWith(expectedSendMessageParams);
	});

	it('sends the correct SOI consents and SOI email for Feast acquisitions', async () => {
		const subscriptionId = '11111';
		const identityId = '22222';
		const emailAddress = '97823f89@gmail.com';
		(fetch as unknown as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({
				status: 'ok',
				user: {
					primaryEmailAddress: emailAddress,
					id: identityId,
					publicFields: {
						displayName: 'user',
					},
					dates: {
						accountCreatedDate: '2019-08-20T14:53:04Z',
					},
					consents: [],
					hasPassword: true,
				},
			}),
		} as never);

		const event: DynamoDBStreamEvent = {
			Records: [
				{
					eventName: 'INSERT',
					dynamodb: {
						NewImage: {
							subscriptionId: { S: subscriptionId },
							userId: { S: identityId },
						},
					},
				},
			],
		};

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = subscriptionId;
		sub.startTimestamp = '2023-03-14 07:24:38 UTC';
		sub.endTimestamp = '2023-03-14 07:24:38 UTC';
		sub.platform = Platform.IosFeast;
		mockedDynamoDBMapper.setMockGet(() => sub);

		await handler(event);

		expect(mockDataMapper.get).toHaveBeenCalledTimes(1);
		const expectedQuery = new SubscriptionEmpty();
		expectedQuery.setSubscriptionId(subscriptionId);
		expect(mockDataMapper.get).toHaveBeenCalledWith(expectedQuery);

		expect(mockSQSClient.send).toHaveBeenCalledTimes(2);

		const expectedSOIParams = {
			QueueUrl: `https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/soft-opt-in-consent-setter-queue-CODE`,
			MessageBody: JSON.stringify({
				identityId,
				eventType: 'Acquisition',
				productName: 'FeastInAppPurchase',
				subscriptionId,
			}),
		};
		expect(mockSQSClient.send).toHaveBeenCalledWith(expectedSOIParams);

		const expectedEmailParams = {
			QueueUrl: `https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/braze-emails-CODE`,
			MessageBody: JSON.stringify({
				To: {
					Address: emailAddress,
					ContactAttributes: { SubscriberAttributes: {} },
				},
				DataExtensionName: 'SV_FA_SOINotification',
				IdentityUserId: identityId,
			}),
		};
		expect(mockSQSClient.send).toHaveBeenCalledWith(expectedEmailParams);
	});

	it('sends the correct SOI for Feast Android acquisitions', async () => {
		const subscriptionId = '11111';
		const identityId = '22222';
		const emailAddress = '97823f89@gmail.com';
		(fetch as unknown as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({
				status: 'ok',
				user: {
					primaryEmailAddress: emailAddress,
					id: identityId,
					publicFields: {
						displayName: 'user',
					},
					dates: {
						accountCreatedDate: '2019-08-20T14:53:04Z',
					},
					consents: [],
					hasPassword: true,
				},
			}),
		} as never);

		const event: DynamoDBStreamEvent = {
			Records: [
				{
					eventName: 'INSERT',
					dynamodb: {
						NewImage: {
							subscriptionId: { S: subscriptionId },
							userId: { S: identityId },
						},
					},
				},
			],
		};

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = subscriptionId;
		sub.startTimestamp = '2023-03-14 07:24:38 UTC';
		sub.endTimestamp = '2023-03-14 07:24:38 UTC';
		sub.platform = Platform.AndroidFeast;
		mockedDynamoDBMapper.setMockGet(() => sub);

		await handler(event);

		expect(mockDataMapper.get).toHaveBeenCalledTimes(1);
		const expectedQuery = new SubscriptionEmpty();
		expectedQuery.setSubscriptionId(subscriptionId);
		expect(mockDataMapper.get).toHaveBeenCalledWith(expectedQuery);

		expect(mockSQSClient.send).toHaveBeenCalledTimes(2);

		const expectedSOIParams = {
			QueueUrl: `https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/soft-opt-in-consent-setter-queue-CODE`,
			MessageBody: JSON.stringify({
				identityId,
				eventType: 'Acquisition',
				productName: 'FeastInAppPurchase',
				subscriptionId,
			}),
		};
		expect(mockSQSClient.send).toHaveBeenCalledWith(expectedSOIParams);

		const expectedEmailParams = {
			QueueUrl: `https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/braze-emails-CODE`,
			MessageBody: JSON.stringify({
				To: {
					Address: emailAddress,
					ContactAttributes: { SubscriberAttributes: {} },
				},
				DataExtensionName: 'SV_FA_SOINotification',
				IdentityUserId: identityId,
			}),
		};
		expect(mockSQSClient.send).toHaveBeenCalledWith(expectedEmailParams);
	});

	it('should process a post acquisition sign-in correctly', async () => {
		(fetch as unknown as jest.Mock).mockResolvedValue({
			ok: true,
			json: async () => ({
				status: 'ok',
				user: {
					primaryEmailAddress: '97823f89@gmail.com',
					id: '100005546',
					publicFields: {
						displayName: 'user',
					},
					dates: {
						accountCreatedDate: '2019-08-20T14:53:04Z',
					},
					consents: [],
					hasPassword: true,
				},
			}),
		} as never);
		const event: DynamoDBStreamEvent = {
			Records: [
				{
					eventName: 'INSERT',
					dynamodb: {
						NewImage: {
							subscriptionId: { S: '12345' },
							userId: { S: '67890' },
						},
					},
				},
			],
		};

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-01 07:24:38 UTC';
		sub.endTimestamp = '2025-03-01 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		await handler(event);

		expect(mockDataMapper.get).toHaveBeenCalledTimes(1);

		const subEmpty = new SubscriptionEmpty();
		subEmpty.setSubscriptionId('12345');
		expect(mockDataMapper.get).toHaveBeenCalledWith(subEmpty);

		expect(mockSQSClient.send).toHaveBeenCalledTimes(2);

		expect(fetch).toHaveBeenCalledTimes(1);

		const expectedSendMessageParams1 = {
			QueueUrl: `https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/soft-opt-in-consent-setter-queue-CODE`,
			MessageBody: JSON.stringify({
				identityId: '67890',
				eventType: 'Acquisition',
				productName: 'InAppPurchase',
				subscriptionId: '12345',
			}),
		};

		expect(mockSQSClient.send).toHaveBeenCalledWith(expectedSendMessageParams1);
	});
});
