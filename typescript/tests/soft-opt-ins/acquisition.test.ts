import {acquisitionHandler, isPostAcquisition} from "../../src/soft-opt-ins/softOptIns";
import {DynamoDBStreamEvent} from "aws-lambda";

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

        setMockQuery(async function* (params: { keyCondition: any; indexName: any; }) {
            console.log(params);

            // expect(params.keyCondition).toEqual('custom_key_condition');
            // expect(params.indexName).toEqual('custom_index_name');

            // You can yield the custom response here
            yield { subscriptionId: '133', userId: '123' };
            yield { subscriptionId: '233', userId: '123' };
        });

        await acquisitionHandler(event);
    });
});