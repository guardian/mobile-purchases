import { SubscriptionEmpty } from '../../src/models/subscription';
import {
	handler,
	messageIsOneDayOld,
} from '../../src/soft-opt-ins/dlq-processor';
import { processAcquisition } from '../../src/soft-opt-ins/processSubscription';
import {
	expect,
	jest,
	describe,
	beforeEach,
	afterEach,
	test,
	it,
} from '@jest/globals';
import * as dynamodbMapper from '@aws/dynamodb-data-mapper';
import {
	ReceiveMessageCommand,
	DeleteMessageCommand,
	SendMessageCommand,
} from '@aws-sdk/client-sqs';
import fetch from 'node-fetch';

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

const mockedSQS = {
	send: jest.fn(),
	setMockReceiveMessage: (fn: (params: unknown) => unknown) => {
		mockedSQS.send.mockImplementation(async (command) => {
			if (command instanceof ReceiveMessageCommand) {
				return fn(command);
			}
			return {};
		});
	},
};

jest.mock('../../src/soft-opt-ins/processSubscription', () => ({
	processAcquisition: jest.fn(() => Promise.resolve(true)),
}));

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

jest.mock('@aws-sdk/client-sqs', () => {
	const mockSQS = {
		send: jest.fn(),
	};
	const setMockReceiveMessage = (
		mockImplementation: (arg0: unknown) => unknown,
	) => {
		mockSQS.send.mockImplementation(async (command) => {
			if (command instanceof ReceiveMessageCommand) {
				return mockImplementation(command);
			}
			if (command instanceof DeleteMessageCommand) {
				return {};
			}
			if (command instanceof SendMessageCommand) {
				return {};
			}
			return {};
		});
	};
	return {
		__esModule: true,
		SQSClient: jest.fn(() => mockSQS),
		ReceiveMessageCommand: jest.fn(),
		DeleteMessageCommand: jest.fn(),
		SendMessageCommand: jest.fn(),
		setMockReceiveMessage: setMockReceiveMessage,
	};
});

jest.mock('@aws-sdk/client-dynamodb', () => jest.fn());
jest.mock('@aws-sdk/client-s3', () => jest.fn());
jest.mock('@aws-sdk/client-ssm', () => jest.fn());

jest.mock('node-fetch', () => jest.fn());

jest.mock('../../src/utils/guIdentityApi');
jest.mock('@jest/globals');
jest.mock('@aws-sdk/client-cloudwatch', () => jest.fn());

jest.mock('util', () => jest.fn());

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
		expect(messageIsOneDayOld(timestamp)).toStrictEqual(true);
	});

	test('Return false if message is not older than one day', () => {
		const timestamp = 1686648235000;
		expect(messageIsOneDayOld(timestamp)).toStrictEqual(false);
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

	it('should not delete message', async () => {
		const mockProcessAcquisition = processAcquisition as jest.Mock;
		mockProcessAcquisition.mockResolvedValue(false as never);

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-01 07:24:38 UTC';
		sub.endTimestamp = '2025-03-01 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		let receiveMessageCallCount = 0;

		const { setMockReceiveMessage } = require('@aws-sdk/client-sqs');
		setMockReceiveMessage(() => {
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

		await handler({});

		expect(mockDataMapper.get).toHaveBeenCalledTimes(1);

		const expectedQuery = new SubscriptionEmpty();
		expectedQuery.setSubscriptionId('12345');
		expect(mockDataMapper.get).toHaveBeenCalledWith(expectedQuery);

		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();
		expect(mockSQSClient.send).toHaveBeenCalled();
	});

	it('should delete expired message', async () => {
		const mockProcessAcquisition = processAcquisition as jest.Mock;
		mockProcessAcquisition.mockResolvedValue(true as never);

		let receiveMessageCallCount = 0;

		const { setMockReceiveMessage } = require('@aws-sdk/client-sqs');
		setMockReceiveMessage(() => {
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

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-01 07:24:38 UTC';
		sub.endTimestamp = '2025-03-01 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		await handler({});

		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();
		expect(mockSQSClient.send).toHaveBeenCalled();
	});

	it('should delete successful message', async () => {
		const mockProcessAcquisition = processAcquisition as jest.Mock;
		mockProcessAcquisition.mockResolvedValue(true as never);

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-01 07:24:38 UTC';
		sub.endTimestamp = '2025-03-01 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		let receiveMessageCallCount = 0;

		const { setMockReceiveMessage } = require('@aws-sdk/client-sqs');
		setMockReceiveMessage(() => {
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

		await handler({});

		expect(mockDataMapper.get).toHaveBeenCalledTimes(1);

		const expectedQuery = new SubscriptionEmpty();
		expectedQuery.setSubscriptionId('12345');
		expect(mockDataMapper.get).toHaveBeenCalledWith(expectedQuery);

		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();
		expect(mockSQSClient.send).toHaveBeenCalled();
	});
});
