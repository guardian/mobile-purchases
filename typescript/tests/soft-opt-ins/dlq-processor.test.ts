import SQS from 'aws-sdk/clients/sqs';
import { SubscriptionEmpty } from '../../src/models/subscription';
import { handler, messageIsOneDayOld } from '../../src/soft-opt-ins/dlq-processor';
import { processAcquisition } from '../../src/soft-opt-ins/processSubscription';

jest.mock('../../src/soft-opt-ins/processSubscription', () => ({
    processAcquisition: jest.fn(() => Promise.resolve(true)),
}));

jest.mock('@aws/dynamodb-data-mapper', () => {
    const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

    const getFn = jest.fn();

    return {
        ...actualDataMapper,
        DataMapper: jest.fn().mockImplementation(() => ({
            batchPut: jest.fn(),
            get: getFn,
            put: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn(),
            query: jest.fn(),
            scan: jest.fn(),
            update: jest.fn(),
        })),
        setMockGet: (mockImplementation: (arg0: any) => any) => {
            getFn.mockImplementation(async (params) => {
                return mockImplementation(params);
            });
        },
    };
});
const setMockGet = require('@aws/dynamodb-data-mapper').setMockGet;

// mock so imports don't use real client which throws an error as credentials are needed
jest.mock('aws-sdk/clients/dynamodb', () => jest.fn());
jest.mock('aws-sdk/clients/s3', () => jest.fn());
jest.mock('aws-sdk/clients/ssm', () => jest.fn());

const fetch = require('node-fetch');

jest.mock('node-fetch');

jest.mock('../../src/utils/guIdentityApi');
jest.mock('aws-sdk/clients/ssm', () => jest.fn());
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

    const setMockReceiveMessage = (mockImplementation: (arg0: any) => any) => {
        receiveMessageFn.mockImplementation((params) => {
            return {
                promise: async () => mockImplementation(params),
            };
        });
    };

    return {
        __esModule: true, // this property makes it work when using ES6 imports
        default: jest.fn(() => mockSQS),
        setMockReceiveMessage: setMockReceiveMessage,
    };
});

const { setMockReceiveMessage } = require('aws-sdk/clients/sqs');

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
        jest.useFakeTimers('modern');
        jest.setSystemTime(new Date('2023-03-14'));
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
        jest.useFakeTimers('modern');
        jest.setSystemTime(new Date('2023-03-14'));
    });

    afterEach(() => {
        // Clean up the fake timers after each test
        jest.useRealTimers();

        fetch.mockReset();
    });

    it('should not delete message', async () => {
        const mockProcessAcquisition = processAcquisition as jest.Mock;
        mockProcessAcquisition.mockResolvedValue(false);

        // get the mock instances
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const mockSQS = new SQS();

        const sub = new SubscriptionEmpty();
        sub.subscriptionId = '12345';
        sub.startTimestamp = '2023-03-01 07:24:38 UTC';
        sub.endTimestamp = '2025-03-01 07:24:38 UTC';

        setMockGet(() => sub);

        let receiveMessageCallCount = 0;

        setMockReceiveMessage(() => {
            receiveMessageCallCount++;

            if (receiveMessageCallCount > 1) {
                return { Messages: [] }; // Return empty array to stop the loop after first run
            } else {
                // This will run on first call
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
        mockProcessAcquisition.mockResolvedValue(true);

        // get the mock instances
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const mockSQS = new SQS();

        const sub = new SubscriptionEmpty();
        sub.subscriptionId = '12345';
        sub.startTimestamp = '2023-03-01 07:24:38 UTC';
        sub.endTimestamp = '2025-03-01 07:24:38 UTC';

        setMockGet(() => sub);

        let receiveMessageCallCount = 0;

        setMockReceiveMessage(() => {
            receiveMessageCallCount++;

            if (receiveMessageCallCount > 1) {
                return { Messages: [] }; // Return empty array to stop the loop after first run
            } else {
                // This will run on first call
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
        mockProcessAcquisition.mockResolvedValue(true);

        // get the mock instances
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const mockSQS = new SQS();

        const sub = new SubscriptionEmpty();
        sub.subscriptionId = '12345';
        sub.startTimestamp = '2023-03-01 07:24:38 UTC';
        sub.endTimestamp = '2025-03-01 07:24:38 UTC';

        setMockGet(() => sub);

        let receiveMessageCallCount = 0;

        setMockReceiveMessage(() => {
            receiveMessageCallCount++;

            if (receiveMessageCallCount > 1) {
                return { Messages: [] }; // Return empty array to stop the loop after first run
            } else {
                // This will run on first call
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
