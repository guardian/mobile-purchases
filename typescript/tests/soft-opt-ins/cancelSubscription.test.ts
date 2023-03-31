import { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { ReadUserSubscription } from "../../src/models/userSubscription";
import { getCancellationRecords, handler } from "../../src/soft-opt-ins/cancelSubscription";


describe("getCancellationRecords", () => {
	it("should return filtered cancellation records from event", async () => {
		const dynamoDbEvent = { Records: [cancellationRecord, insertDynamoRecord, updateDynamoRecord] };
		const filteredRecords = getCancellationRecords(dynamoDbEvent);
		expect(filteredRecords.length).toEqual(1);
	});

	it("should return empty array when no cancellation records in event", () => {
		const dynamoDbEvent = { Records: [insertDynamoRecord, updateDynamoRecord] };
		const filteredRecords = getCancellationRecords(dynamoDbEvent);
		expect(filteredRecords.length).toEqual(0);
	})
});

jest.mock('@aws/dynamodb-data-mapper', () => {
	const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

	const queryFn = jest.fn();

	return {
		...actualDataMapper,
		DataMapper: jest.fn().mockImplementation(() => ({
			batchPut: jest.fn(),
			get: jest.fn(),
			put: jest.fn().mockResolvedValue(undefined),
			delete: jest.fn(),
			query: queryFn,
			scan: jest.fn(),
			update: jest.fn(),
		})),
		setMockQuery: (mockImplementation: (arg0: any) => any) => {
			queryFn.mockImplementation(async function* (params) {
				const iterator = mockImplementation(params);
				for await (const item of iterator) {
					yield item;
				}
			});
		},
	};
});
jest.mock('aws-sdk/clients/sqs', () => {
	const mockSQS = {
		sendMessage: jest.fn().mockReturnValue({ promise: jest.fn() }),
	};

	return jest.fn(() => mockSQS)
})
jest.mock('aws-sdk/clients/cloudwatch', () => jest.fn());

const setMockQuery = require('@aws/dynamodb-data-mapper').setMockQuery;

describe("handler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should process cancel records, put message on queue', async () => {

		// get the mock instances
		const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
		const mockSQS = new (require('aws-sdk/clients/sqs'))();

		setMockQuery(async function* (params: { keyCondition: any; indexName: any; }) {
			yield {
				subscriptionId: '1',
				userId: '123',
				startTimestamp: "2023-03-14 07:24:38 UTC",
				endTimestamp: "2025-03-01 07:24:38 UTC",
				cancellationTimestamp: null,
				autoRenewing: false,
				productId: '',
				platform: undefined,
				freeTrial: undefined,
				billingPeriod: undefined,
				googlePayload: undefined,
				receipt: undefined,
				applePayload: undefined,
				ttl: undefined,
			};
		});

		const event: DynamoDBStreamEvent = {
			Records: [cancellationRecord, insertDynamoRecord, updateDynamoRecord]
		}

		await handler(event);
		expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
		expect(mockDataMapper.query).toHaveBeenCalledWith(ReadUserSubscription, { subscriptionId: "1" }, { indexName: "subscriptionId-userId" });

		expect(mockSQS.sendMessage).toHaveBeenCalledTimes(1);
		const expectedSoftOptInMessage = {
			identityId: "123",
			eventType: "Cancellation",
			productName: "InAppPurchase"
		};
		const expectedQueueMessageParams = {
			QueueUrl: 'soft-opt-in-consent-setter-queue-DEV',
			MessageBody: JSON.stringify(expectedSoftOptInMessage),
		};

		expect(mockSQS.sendMessage).toHaveBeenCalledWith(expectedQueueMessageParams);
	})
})


const updateDynamoRecord: DynamoDBRecord = {
	dynamodb: {
		Keys: {
			subscriptionId: {
				S: "1",
			},
		},
		NewImage: {
			subscriptionId: {
				S: "1",
			}
		},
	},
	eventName: "MODIFY",
}


const insertDynamoRecord: DynamoDBRecord = {
	dynamodb: {
		Keys: {
			subscriptionId: {
				S: "1",
			},
		},
		NewImage: {
			subscriptionId: {
				S: "1",
			},
		},
	},
	eventName: "INSERT",
}

const cancellationRecord: DynamoDBRecord = {
	dynamodb: {
		Keys: {
			subscriptionId: {
				S: "1",
			},
		},
		NewImage: {
			subscriptionId: {
				S: "1",
			},
			cancellationTimestamp: {
				N: "1",
			},
		},
	},
	eventName: "MODIFY",
};
