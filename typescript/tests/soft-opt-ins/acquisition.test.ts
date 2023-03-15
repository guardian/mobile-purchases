import {acquisitionHandler, isPostAcquisition} from "../../src/soft-opt-ins/softOptIns";
import {DynamoDBStreamEvent} from "aws-lambda";

jest.mock('@aws/dynamodb-data-mapper', () => {
    const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

    const mockQueryIterator = {
        [Symbol.asyncIterator]: jest.fn().mockReturnValue({}),
    };

    const queryFn = jest.fn(() => mockQueryIterator);

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
        __setQueryResult: (result: any[]) => {
            mockQueryIterator[Symbol.asyncIterator] = jest.fn(() => result.values());
            queryFn.mockImplementation(() => mockQueryIterator);
        },
    };
});

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

describe('acquisitionHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should process insert records', async () => {
        /*
        (DataMapper.prototype.query as jest.Mock).mockImplementation((item) => {
            expect(item.subscriptionId).toEqual('12345');

            return Promise.resolve(undefined);
        });


        const sendMessageMock = jest.fn().mockReturnValue({ promise: jest.fn() });

        Sqs.prototype.sendMessage = sendMessageMock;
        */


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

        await acquisitionHandler(event);

        const expectedResult = [{subscriptionId: "1"}, 2, 3];
        __setQueryResult(expectedResult);

        expect(mockQueryIterator[Symbol.asyncIterator]).toHaveBeenCalledTimes(1);
        const result = await mockQueryIterator[Symbol.asyncIterator]().next();
        expect(result.done).toBe(false);
        expect(result.value).toEqual({ subscriptionId: '12345', userId: '67890' });
    });
});