import SQS from 'aws-sdk/clients/sqs';
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
import * as sqsModule from 'aws-sdk/clients/sqs';
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

const mockedSQS = sqsModule as unknown as {
	default: new () => {
		receiveMessage: jest.Mock;
		deleteMessage: jest.Mock;
		sendMessage: jest.Mock;
	};
	setMockReceiveMessage: (fn: (arg0: unknown) => unknown) => void;
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

jest.mock('aws-sdk/clients/dynamodb', () => jest.fn());
jest.mock('aws-sdk/clients/s3', () => jest.fn());
jest.mock('aws-sdk/clients/ssm', () => jest.fn());

jest.mock('node-fetch', () => jest.fn());

jest.mock('../../src/utils/guIdentityApi');
jest.mock('@jest/globals');
jest.mock('aws-sdk/clients/cloudwatch', () => jest.fn());

jest.mock('util', () => jest.fn());

jest.mock('aws-sdk/clients/sqs', () => {
	const receiveMessageFn = jest.fn();
	const mockSQS = {
		receiveMessage: receiveMessageFn.mockReturnValue({
			promise: jest.fn(),
		}),
		deleteMessage: jest.fn().mockReturnValue({ promise: jest.fn() }),
		sendMessage: jest.fn().mockReturnValue({ promise: jest.fn() }),
	};
	const setMockReceiveMessage = (
		mockImplementation: (arg0: unknown) => unknown,
	) => {
		receiveMessageFn.mockImplementation((params) => {
			return {
				promise: async () => mockImplementation(params),
			};
		});
	};
	return {
		__esModule: true,
		default: jest.fn(() => mockSQS),
		setMockReceiveMessage: setMockReceiveMessage,
	};
});

jest.mock('aws-sdk/clients/sts', () => {
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

jest.mock('aws-sdk/lib/core', () => {
	class SharedIniFileCredentialsMock {}
	class CredentialProviderChainMock {}
	return {
		SharedIniFileCredentials: SharedIniFileCredentialsMock,
		CredentialProviderChain: CredentialProviderChainMock,
	};
});

describe('messageIsOneDayOld() function', () => {
	beforeEach(() => {
		// Set the current time to a fixed date (2023-03-14)
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2023-03-14').getTime()); // or 1678780800000
	});

	afterEach(() => {
		// Clean up the fake timers after each test
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

		// Set the current time to a fixed date (2023-03-14)
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2023-03-14').getTime()); // or 1678780800000
	});

	afterEach(() => {
		jest.useRealTimers();
		(fetch as unknown as jest.Mock).mockReset();
	});

	it('should not delete message', async () => {
		const mockProcessAcquisition = processAcquisition as jest.Mock;
		mockProcessAcquisition.mockResolvedValue(false as never);

		// get the mock instances
		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const mockSQS = new mockedSQS.default();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-01 07:24:38 UTC';
		sub.endTimestamp = '2025-03-01 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		let receiveMessageCallCount = 0;

		mockedSQS.setMockReceiveMessage(() => {
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

		expect(mockSQS.deleteMessage).toHaveBeenCalledTimes(0);
		expect(mockSQS.receiveMessage).toHaveBeenCalledTimes(2);
	});

	it('should delete expired message', async () => {
		const mockProcessAcquisition = processAcquisition as jest.Mock;
		mockProcessAcquisition.mockResolvedValue(true as never);

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const mockSQS = new mockedSQS.default();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-01 07:24:38 UTC';
		sub.endTimestamp = '2025-03-01 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		let receiveMessageCallCount = 0;

		mockedSQS.setMockReceiveMessage(() => {
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

		await handler({});

		expect(mockSQS.receiveMessage).toHaveBeenCalledTimes(2);
		expect(mockSQS.deleteMessage).toHaveBeenCalledTimes(1);
	});

	it('should delete successful message', async () => {
		const mockProcessAcquisition = processAcquisition as jest.Mock;
		mockProcessAcquisition.mockResolvedValue(true as never);

		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const mockSQS = new mockedSQS.default();

		const sub = new SubscriptionEmpty();
		sub.subscriptionId = '12345';
		sub.startTimestamp = '2023-03-01 07:24:38 UTC';
		sub.endTimestamp = '2025-03-01 07:24:38 UTC';

		mockedDynamoDBMapper.setMockGet(() => sub);

		let receiveMessageCallCount = 0;

		mockedSQS.setMockReceiveMessage(() => {
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

		expect(mockSQS.receiveMessage).toHaveBeenCalledTimes(2);
		expect(mockSQS.deleteMessage).toHaveBeenCalledTimes(1);
	});
});
