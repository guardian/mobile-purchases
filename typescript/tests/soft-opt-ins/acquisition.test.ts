import {handler, isPostAcquisition} from "../../src/soft-opt-ins/acquisitions";
import {DynamoDBStreamEvent} from "aws-lambda";
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

const fetch = require('node-fetch');
jest.mock('node-fetch');

jest.mock('../../src/utils/guIdentityApi');
jest.mock('aws-sdk/clients/ssm', () => jest.fn());
jest.mock('aws-sdk/clients/cloudwatch', () => jest.fn());

jest.mock('util', () => jest.fn());

jest.mock('aws-sdk/clients/sqs', () => {
    const mockSQS = {
        sendMessage: jest.fn().mockReturnValue({promise: jest.fn()}),
    };

    return jest.fn(() => mockSQS)
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

describe("isPostAcquisition() function", () => {
    beforeEach(() => {
        // Set the current time to a fixed date (2023-03-14)
        jest.useFakeTimers('modern');
        jest.setSystemTime(new Date('2023-03-14'));
    });

    afterEach(() => {
        // Clean up the fake timers after each test
        jest.useRealTimers();
    });

    test("Return true if acquisition was more than two days ago", () => {
        const startTimestamp = "2023-03-01 07:24:38 UTC"

        expect(isPostAcquisition(startTimestamp)).toStrictEqual(true);
    });

    test("Return false if acquisition was less than two days ago", () => {
        const startTimestamp = "2023-03-13 07:24:38 UTC"

        expect(isPostAcquisition(startTimestamp)).toStrictEqual(false);
    });
});

describe('handler', () => {
    beforeEach(() => {
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

    it('should process an acquisition correctly', async () => {
        const event: DynamoDBStreamEvent = {
            Records: [
                {
                    eventName: 'INSERT',
                    dynamodb: {
                        NewImage: {
                            subscriptionId: {S: '12345'},
                            userId: {S: '67890'},
                        },
                    },
                },
            ]
        };

        // get the mock instances
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const mockSQS = new (require('aws-sdk/clients/sqs'))();

        setMockQuery(async function* (params: { keyCondition: any; indexName: any; }) {
            yield {
                subscriptionId: '12345',
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

        await handler(event);

        expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
        expect(mockDataMapper.query).toHaveBeenCalledWith(ReadSubscription, {subscriptionId: "12345"}, {indexName: "subscriptionId"});

        expect(mockSQS.sendMessage).toHaveBeenCalledTimes(1);

        const expectedSendMessageParams1 = {
            QueueUrl: `soft-opt-in-consent-setter-queue-DEV`,
            MessageBody: JSON.stringify({identityId: '67890', eventType: 'Acquisition', productName: "InAppPurchase"}),
        };

        expect(mockSQS.sendMessage).toHaveBeenCalledWith(expectedSendMessageParams1);
    });

    it('should process a post acquisition sign-in correctly', async () => {
        fetch.mockResolvedValue({
            ok: true,
            json: async () => ({
                    "status": "ok",
                    "user": {
                        "primaryEmailAddress": "97823f89@gmail.com",
                        "id": "100005546",
                        "publicFields": {
                            "displayName": "user"
                        },
                        "dates": {
                            "accountCreatedDate": "2019-08-20T14:53:04Z"
                        },
                        "consents": [],
                        "hasPassword": true
                    }
            }),
        });

        const event: DynamoDBStreamEvent = {
            Records: [
                {
                    eventName: 'INSERT',
                    dynamodb: {
                        NewImage: {
                            subscriptionId: {S: '12345'},
                            userId: {S: '67890'},
                        },
                    },
                },
            ]
        };

        // get the mock instances
        const mockDataMapper = new (require('@aws/dynamodb-data-mapper').DataMapper)();
        const mockSQS = new (require('aws-sdk/clients/sqs'))();

        setMockQuery(async function* (params: { keyCondition: any; indexName: any; }) {
            yield {
                subscriptionId: '12345',
                startTimestamp: "2023-03-01 07:24:38 UTC",
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

        await handler(event);

        expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
        expect(mockDataMapper.query).toHaveBeenCalledWith(ReadSubscription, {subscriptionId: "12345"}, {indexName: "subscriptionId"});

        expect(mockSQS.sendMessage).toHaveBeenCalledTimes(2);

        expect(fetch).toHaveBeenCalledTimes(1);

        const expectedSendMessageParams1 = {
            QueueUrl: `soft-opt-in-consent-setter-queue-DEV`,
            MessageBody: JSON.stringify({identityId: '67890', eventType: 'Acquisition', productName: "InAppPurchase"}),
        };

        expect(mockSQS.sendMessage).toHaveBeenCalledWith(expectedSendMessageParams1);
    });
});