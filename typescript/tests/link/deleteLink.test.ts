import { DynamoDBRecord, DynamoDBStreamEvent } from "aws-lambda";
import { ReadUserSubscription } from "../../src/models/userSubscription";
import { handler } from "../../src/link/deleteLink";

jest.mock('@aws/dynamodb-data-mapper', () => {
    const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

    const queryFn = jest.fn();
    const putFn = jest.fn().mockResolvedValue(true);
    const deleteFn = jest.fn().mockResolvedValue(true);

    return {
        ...actualDataMapper,
        DataMapper: jest.fn().mockImplementation(() => ({
            put: putFn,
            delete: deleteFn,
            query: queryFn,
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

jest.mock('util', () => jest.fn());

jest.mock('aws-sdk/clients/sqs', () => {
    const mockSQS = {
        sendMessage: jest.fn().mockReturnValue({promise: jest.fn()}),
    };

    return jest.fn(() => mockSQS)
})
jest.mock('../../src/utils/guIdentityApi');

// mock so imports don't use real client which throws an error as credentials are needed
jest.mock('aws-sdk/clients/dynamodb', () => jest.fn());
jest.mock('aws-sdk/clients/s3', () => jest.fn());
jest.mock('aws-sdk/clients/ssm', () => jest.fn());

jest.mock('aws-sdk/clients/ssm', () => jest.fn());
jest.mock('aws-sdk/clients/cloudwatch', () => jest.fn());

jest.mock('aws-sdk/clients/sts', () => {
    const mockSTS = {
        assumeRole: jest.fn().mockReturnValue({
            promise: jest.fn().mockResolvedValue({
                Credentials: {
                    AccessKeyId: 'mockAccessKeyId',
                    SecretAccessKey: 'mockSecretAccessKey',
                    SessionToken: 'mockSessionToken',
                },
            }),
        }),
    };

    return jest.fn(() => mockSTS)
})

jest.mock('aws-sdk/lib/core', () => {
    class SharedIniFileCredentialsMock {
    }

    class CredentialProviderChainMock {
    }

    return {
        SharedIniFileCredentials: SharedIniFileCredentialsMock,
        CredentialProviderChain: CredentialProviderChainMock,
    };
});

const setMockQuery = require('@aws/dynamodb-data-mapper').setMockQuery;

describe("handler", () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Set the current time to a fixed date (2023-03-14)
        jest.useFakeTimers('modern');
        jest.setSystemTime(new Date('2023-03-14'));
    });

    afterEach(() => {
        // Clean up the fake timers after each test
        jest.useRealTimers();
    });

    it('should process removed records, put messages on queue', async () => {

        // get the mock instances
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const mockSQS = new (require('aws-sdk/clients/sqs'))();

        setMockQuery(async function* (params: { keyCondition: any; indexName: any; }) {
            yield {
                subscriptionId: '1',
                userId: '123',
            };
        });

        const event: DynamoDBStreamEvent = {
            Records: [removeDynamoRecord]
        }

        const result = await handler(event);

        expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
        expect(mockDataMapper.query).toHaveBeenCalledWith(ReadUserSubscription, { subscriptionId: "1" }, { indexName: "subscriptionId-userId" });

        expect(mockDataMapper.delete).toHaveBeenCalledTimes(1);
        expect(mockDataMapper.delete).toHaveBeenCalledWith({"subscriptionId": "1", "userId": "123"});

        expect(mockSQS.sendMessage).toHaveBeenCalledTimes(1);

        const expectedSoftOptInMessage1 = {
            identityId: "123",
            eventType: "Cancellation",
            productName: "InAppPurchase",
            subscriptionId: "1"
        };

        const expectedQueueMessageParams1 = {
            QueueUrl: 'https://sqs.eu-west-1.amazonaws.com/mock-aws-account-id/soft-opt-in-consent-setter-queue-DEV',
            MessageBody: JSON.stringify(expectedSoftOptInMessage1),
        };

        expect(mockSQS.sendMessage).toHaveBeenCalledWith(expectedQueueMessageParams1);

        expect(result).toEqual({ recordCount: 1, rowCount: 1 })
    })

    it('should not process modified records', async () => {

        // get the mock instances
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const mockSQS = new (require('aws-sdk/clients/sqs'))();

        const event: DynamoDBStreamEvent = {
            Records: [modifyDynamoRecord]
        }

        const result = await handler(event);

        expect(mockDataMapper.query).toHaveBeenCalledTimes(0);
        expect(mockDataMapper.put).toHaveBeenCalledTimes(0);
        expect(mockDataMapper.delete).toHaveBeenCalledTimes(0);
        expect(mockSQS.sendMessage).toHaveBeenCalledTimes(0);

        expect(result).toEqual({ recordCount: 0, rowCount: 0 })
    })
})

const removeDynamoRecord: DynamoDBRecord = {
    dynamodb: {
        OldImage: {
            subscriptionId: {
                S: "1",
            },
        }
    },
    eventName: "REMOVE",
    userIdentity: {
        type: "Service",
        principalId: "dynamodb.amazonaws.com"
    }
};

const modifyDynamoRecord: DynamoDBRecord = {
    dynamodb: {
        OldImage: {
            subscriptionId: {
                S: "4",
            },
        },
        NewImage: {
            subscriptionId: {
                S: "4",
            },
            cancellationTimestamp: {
                S: "123412341"
            }
        }
    },
    eventName: "MODIFY",
};