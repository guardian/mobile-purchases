import {acquisitionHandler, isPostAcquisition, main} from "../../src/soft-opt-ins/softOptIns";
import {DynamoDBStreamEvent} from "aws-lambda";
import {SubscriptionEvent} from "../../src/models/subscriptionEvent";
import Mock = jest.Mock;
import {QueryIterator} from "@aws/dynamodb-data-mapper";
import {ReadSubscription} from "../../src/models/subscription";

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
const setMockQuery = require('@aws/dynamodb-data-mapper').setMockQuery;

// mock so imports don't use real client which throws an error as credentials are needed
jest.mock('aws-sdk/clients/dynamodb', () => jest.fn());
jest.mock('aws-sdk/clients/s3', () => jest.fn());
jest.mock('aws-sdk/clients/ssm', () => jest.fn());

jest.mock('aws-sdk/clients/sqs', () => {
    const mockSQS = {
        sendMessage: jest.fn().mockReturnValue({ promise: jest.fn() }),
    };

    return jest.fn(() => mockSQS)
})

jest.mock('aws-sdk/lib/core', () => {
    class SharedIniFileCredentialsMock {}
    class CredentialProviderChainMock {}

    return {
        SharedIniFileCredentials: SharedIniFileCredentialsMock,
        CredentialProviderChain: CredentialProviderChainMock,
    };
});

describe("isPostAcquisition() function", () => {
    test("Return true if acquisition was more than two days ago", () => {
        const date1 = new Date('2023-03-14');
        const date2 = new Date('2023-03-01');

        expect(isPostAcquisition(date1, date2)).toStrictEqual(true);
    });

    test("Return false if acquisition was less than two days ago", () => {
        const date1 = new Date('2023-03-14');
        const date2 = new Date('2023-03-13');

        expect(isPostAcquisition(date1, date2)).toStrictEqual(false);
    });
});

function createAsyncIterable(items: any[]): AsyncIterable<any> {
    return {
        [Symbol.asyncIterator]: async function* () {
            for (const item of items) {
                yield item;
            }
        },
    };
}

class CustomQueryIterator<T> extends QueryIterator<T> {
    constructor(asyncIterable: AsyncIterable<T>) {
        // @ts-ignore
        super(asyncIterable, () => {}, {});
    }
}

describe('acquisitionHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should process insert records', async () => {
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
            ]
        };

        const mockStoreFunction: Mock<QueryIterator<ReadSubscription>, [String]> = jest.fn((subscriptionId) => {
            const items = [
                // Add the items you want the iterator to return
                { subscriptionId: '12345', userId: '67890' },
                { subscriptionId: '12345', userId: '123' },
            ];

            const asyncIterable = createAsyncIterable(items);
            return new QueryIterator(asyncIterable, ReadSubscription, null);
        });

        const mockSqsFunction: Mock<Promise<any>> = jest.fn((queurl, event) => Promise.resolve({}));

        await main(event, mockStoreFunction, mockSqsFunction);
    });
});