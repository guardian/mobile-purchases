import type { DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';
import { handler } from '../../src/link/deleteLink';
import { UserSubscriptionEmpty } from '../../src/models/userSubscription';
import * as dynamodbMapper from '@aws/dynamodb-data-mapper';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
	expect,
	describe,
	it,
	beforeEach,
	afterEach,
	jest,
} from '@jest/globals';

const mockedDynamoDBMapper = dynamodbMapper as unknown as {
	DataMapper: new () => {
		put: jest.Mock;
		delete: jest.Mock;
		query: jest.Mock;
	};
	setMockQuery: (
		fn: (params: {
			keyCondition: unknown;
			indexName: unknown;
		}) => AsyncIterable<unknown>,
	) => void;
};

jest.mock('@aws/dynamodb-data-mapper', () => {
	const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

	const queryFn = jest.fn();
	const putFn = jest.fn().mockResolvedValue(true as never);
	const deleteFn = jest.fn().mockResolvedValue(true as never);

	return Object.assign({}, actualDataMapper, {
		DataMapper: jest.fn().mockImplementation(() => ({
			put: putFn,
			delete: deleteFn,
			query: queryFn,
		})),
		setMockQuery: (mockImplementation: (arg0: unknown) => unknown) => {
			queryFn.mockImplementation(async function* (params) {
				const iterator = mockImplementation(params);
				for await (const item of iterator as AsyncIterable<unknown>) {
					yield item;
				}
			});
		},
	});
});

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

jest.mock('../../src/utils/guIdentityApi');

jest.mock('@aws-sdk/client-dynamodb', () => jest.fn());
jest.mock('@aws-sdk/client-s3', () => jest.fn());
jest.mock('@aws-sdk/client-ssm', () => jest.fn());

jest.mock('@aws-sdk/client-cloudwatch', () => jest.fn());

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

describe('handler', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		jest.setSystemTime(new Date('2023-03-14').getTime());
	});

	afterEach(() => {
		// Clean up the fake timers after each test
		jest.useRealTimers();
	});

	it('should process removed records, put messages on queue', async () => {
		// get the mock instances
		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();

		mockedDynamoDBMapper.setMockQuery(async function* (_params: {
			keyCondition: unknown;
			indexName: unknown;
		}) {
			yield {
				subscriptionId: '1',
				userId: '123',
			};
		});

		const event: DynamoDBStreamEvent = {
			Records: [buildRemovedDynamoRecord('1', 'ios')],
		};

		const result = await handler(event);

		expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
		expect(mockDataMapper.query).toHaveBeenCalledWith(
			UserSubscriptionEmpty,
			{ subscriptionId: '1' },
			{ indexName: 'subscriptionId-userId' },
		);

		expect(mockDataMapper.delete).toHaveBeenCalledTimes(1);
		expect(mockDataMapper.delete).toHaveBeenCalledWith({
			subscriptionId: '1',
			userId: '123',
		});

		expect(mockSQSClient.send).toHaveBeenCalledTimes(1);

		const expectedSoftOptInMessage1 = {
			identityId: '123',
			eventType: 'Cancellation',
			productName: 'InAppPurchase',
			subscriptionId: '1',
		};

		expect(mockSQSClient.send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					QueueUrl:
						'https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/soft-opt-in-consent-setter-queue-CODE',
					MessageBody: JSON.stringify(expectedSoftOptInMessage1),
				},
			}),
		);

		expect(result).toEqual({ recordCount: 1, rowCount: 1 });
	});

	it('puts Feast deletions on the SOI SQS queue with the product name FeastInAppPurchase', async () => {
		// get the mock instances
		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();

		const subscriptionId = '1';
		const userId = '123';

		mockedDynamoDBMapper.setMockQuery(async function* (_params: {
			keyCondition: unknown;
			indexName: unknown;
		}) {
			yield {
				subscriptionId,
				userId,
			};
		});

		const event: DynamoDBStreamEvent = {
			Records: [buildRemovedDynamoRecord(subscriptionId, 'ios-feast')],
		};

		const result = await handler(event);

		expect(mockSQSClient.send).toHaveBeenCalledTimes(1);

		const expectedSoftOptInMessage1 = {
			identityId: userId,
			eventType: 'Cancellation',
			productName: 'FeastInAppPurchase',
			subscriptionId,
		};

		expect(mockSQSClient.send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					QueueUrl:
						'https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/soft-opt-in-consent-setter-queue-CODE',
					MessageBody: JSON.stringify(expectedSoftOptInMessage1),
				},
			}),
		);

		expect(result).toEqual({ recordCount: 1, rowCount: 1 });
	});

	it('should not process modified records', async () => {
		// get the mock instances
		const mockDataMapper = new mockedDynamoDBMapper.DataMapper();
		const { SQSClient } = require('@aws-sdk/client-sqs');
		const mockSQSClient = SQSClient();

		const event: DynamoDBStreamEvent = {
			Records: [modifyDynamoRecord],
		};

		const result = await handler(event);

		expect(mockDataMapper.query).toHaveBeenCalledTimes(0);
		expect(mockDataMapper.put).toHaveBeenCalledTimes(0);
		expect(mockDataMapper.delete).toHaveBeenCalledTimes(0);
		expect(mockSQSClient.send).toHaveBeenCalledTimes(0);

		expect(result).toEqual({ recordCount: 0, rowCount: 0 });
	});
});

const buildRemovedDynamoRecord = (
	subscriptionId: string,
	platform: string,
): DynamoDBRecord => ({
	dynamodb: {
		OldImage: {
			subscriptionId: {
				S: subscriptionId,
			},
			platform: {
				S: platform,
			},
		},
	},
	eventName: 'REMOVE',
	userIdentity: {
		type: 'Service',
		principalId: 'dynamodb.amazonaws.com',
	},
});

const modifyDynamoRecord: DynamoDBRecord = {
	dynamodb: {
		OldImage: {
			subscriptionId: {
				S: '4',
			},
		},
		NewImage: {
			subscriptionId: {
				S: '4',
			},
			cancellationTimestamp: {
				S: '123412341',
			},
		},
	},
	eventName: 'MODIFY',
};
