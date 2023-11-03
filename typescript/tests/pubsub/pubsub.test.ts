import { parseStoreAndSend } from "../../src/pubsub/pubsub";
import {
    parsePayload as parseGooglePayload,
    toDynamoEvent as googlePayloadToDynamo,
    toSqsSubReference as toGoogleSqsEvent
} from "../../src/pubsub/google";
import {
    parsePayload as parseApplePayload, StatusUpdateNotification,
    toDynamoEvent as applePayloadToDynamo,
    toSqsSubReference as toAppleSqsEvent
} from "../../src/pubsub/apple";
import {HTTPResponses} from "../../src/models/apiGatewayHttp";
import {SubscriptionEvent} from "../../src/models/subscriptionEvent";
import Mock = jest.Mock;
import {APIGatewayProxyEvent} from "aws-lambda";

describe("The google pubsub", () => {
    test("Should return HTTP 200 and store the correct data in dynamo", () => {
        process.env['Secret'] = "MYSECRET";
        process.env['QueueUrl'] = "";

        const mockStoreFunction: Mock<Promise<SubscriptionEvent>, [SubscriptionEvent]> = jest.fn(event => Promise.resolve(event));

        const mockSqsFunction: Mock<Promise<any>, [string, {purchaseToken: string}]> = jest.fn((queurl, event) => Promise.resolve({}));

        const mockFetchMetadataFunction: Mock<Promise<any>> = jest.fn(event => Promise.resolve({freeTrial: true}));

        const receivedEvent = {
            "version":"1.0",
            "packageName":"com.guardian.debug",
            "eventTimeMillis":"1503349566168",
            "subscriptionNotification":
                {
                    "version":"1.0",
                    "notificationType":4,
                    "purchaseToken":"PURCHASE_TOKEN",
                    "subscriptionId":"my.sku"
                }
        };

        const encodedEvent = Buffer.from(JSON.stringify(receivedEvent)).toString('base64');

        const body = {
            message: {
                data: encodedEvent,
                messageId: '123',
                message_id: '123',
                publishTime: '2019-05-24T15:06:47.701Z',
                publish_time: '2019-05-24T15:06:47.701Z'
            },
            subscription: 'projects/guardian.co.uk:maximal-ceiling-820/subscriptions/mobile-pubsub-code'
        };

        const input: APIGatewayProxyEvent = {
            queryStringParameters: {secret: "MYSECRET"},
            body: JSON.stringify(body),
            headers: {},
            multiValueHeaders: {},
            httpMethod: "POST",
            isBase64Encoded: false,
            path: '',
            pathParameters: {},
            multiValueQueryStringParameters: {},
            // @ts-ignore
            requestContext: null,
            resource: '',

        };

        const expectedSubscriptionEventInDynamo: SubscriptionEvent = new SubscriptionEvent(
            "PURCHASE_TOKEN",
            "2017-08-21T21:06:06.168Z|SUBSCRIPTION_PURCHASED",
            "2017-08-21",
            "2017-08-21T21:06:06.168Z",
            "SUBSCRIPTION_PURCHASED",
            "android",
            "com.guardian.debug",
            true,
            {
                eventTimeMillis: "1503349566168",
                packageName: "com.guardian.debug",
                subscriptionNotification: {
                    notificationType: 4,
                    purchaseToken: "PURCHASE_TOKEN",
                    subscriptionId: "my.sku",
                    version: "1.0"
                },
                version: "1.0"
            },
            null,
            1582319167,
            null,
            null,
            undefined,
            undefined,
            undefined
        );

        const expectedSubscriptionReferenceInSqs = {packageName: "com.guardian.debug", purchaseToken: "PURCHASE_TOKEN", subscriptionId: "my.sku"};

        return parseStoreAndSend(input, parseGooglePayload, googlePayloadToDynamo, toGoogleSqsEvent, mockFetchMetadataFunction, mockStoreFunction, mockSqsFunction).then(result => {
            expect(result).toStrictEqual(HTTPResponses.OK);
            expect(mockStoreFunction.mock.calls.length).toEqual(1);
            expect(mockStoreFunction.mock.calls[0][0]).toStrictEqual(expectedSubscriptionEventInDynamo);
            expect(mockSqsFunction.mock.calls.length).toEqual(1);
            expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(expectedSubscriptionReferenceInSqs);
            expect(mockFetchMetadataFunction.mock.calls.length).toEqual(1);
            expect(mockFetchMetadataFunction.mock.calls[0][0]).toStrictEqual(receivedEvent);
        });
    });
});

describe("The apple pubsub", () => {
    test("Should return HTTP 200 and store the correct data in dynamo", () => {
        process.env['Secret'] = "MYSECRET";
        process.env['QueueUrl'] = "";

        const mockStoreFunction: Mock<Promise<SubscriptionEvent>, [SubscriptionEvent]> = jest.fn(event => Promise.resolve(event));

        const mockSqsFunction: Mock<Promise<any>, [string, {receipt: string}]> = jest.fn((queueurl, event) => Promise.resolve({}));

        const mockFetchMetadataFunction: Mock<Promise<any>> = jest.fn(event => Promise.resolve({undefined}));

        const body: StatusUpdateNotification = {
                original_transaction_id: "TEST",
                cancellation_date: "TEST",
                web_order_line_item_id: "TEST",
                auto_renew_adam_id: "TEST",
                expiration_intent: "TEST",
                auto_renew_product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                auto_renew_status: "true",
                bid: "uk.co.guardian.iphone2",
                bvrs: "TEST",
                environment: "Sandbox",
                notification_type: "INITIAL_BUY",
                unified_receipt: {
                    environment: "Sandbox",
                    latest_receipt: "TEST",
                    latest_receipt_info: [{
                        app_item_id: "TEST",
                        bvrs: "TEST",
                        is_in_intro_offer_period: "false",
                        is_trial_period: "true",
                        item_id: "TEST",
                        original_transaction_id: "TEST",
                        product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                        quantity: "1",
                        transaction_id: "TEST",
                        unique_identifier: "TEST",
                        unique_vendor_identifier: "TEST",
                        version_external_identifier: "TEST",
                        web_order_line_item_id: "TEST",
                        purchase_date_ms: "TEST",
                        original_purchase_date_ms: "TEST",
                        expires_date: "TEST",
                        expires_date_ms: "TEST"
                    }],
                    pending_renewal_info: [
                        {
                            auto_renew_product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                            auto_renew_status: "1",
                            original_transaction_id: "TEST",
                            product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                            price_consent_status: '',
                            price_increase_status: '',
                        }
                    ],
                    status: 0
                }
        };

        const input: APIGatewayProxyEvent = {
            queryStringParameters: {secret: "MYSECRET"},
            body: JSON.stringify(body),
            headers: {},
            multiValueHeaders: {},
            httpMethod: "POST",
            isBase64Encoded: false,
            path: '',
            pathParameters: {},
            multiValueQueryStringParameters: {},
            // @ts-ignore
            requestContext: null,
            resource: '',

        };

        const expectedSubscriptionEventInDynamo: any = {
            subscriptionId: "TEST",
            eventType: "INITIAL_BUY",
            platform: "ios",
            appId: "uk.co.guardian.iphone2",
            freeTrial: true,
            googlePayload: null,
            applePayload:
            {
                original_transaction_id: "TEST",
                cancellation_date: "TEST",
                web_order_line_item_id: "TEST",
                auto_renew_adam_id: "TEST",
                expiration_intent: "TEST",
                auto_renew_product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                auto_renew_status: "true",
                bid: "uk.co.guardian.iphone2",
                bvrs: "TEST",
                environment: "Sandbox",
                notification_type: "INITIAL_BUY",
                unified_receipt: {
                    environment: "Sandbox",
                    latest_receipt: "TEST",
                    latest_receipt_info: [
                        {
                            app_item_id: "TEST",
                            bvrs: "TEST",
                            is_in_intro_offer_period: "false",
                            is_trial_period: "true",
                            item_id: "TEST",
                            original_transaction_id: "TEST",
                            product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                            quantity: "1",
                            transaction_id: "TEST",
                            unique_identifier: "TEST",
                            unique_vendor_identifier: "TEST",
                            version_external_identifier: "TEST",
                            web_order_line_item_id: "TEST",
                            purchase_date_ms: "TEST",
                            original_purchase_date_ms: "TEST",
                            expires_date: "TEST",
                            expires_date_ms: "TEST",
                        }
                    ],
                    pending_renewal_info: [
                        {
                        auto_renew_product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial",
                        auto_renew_status: "1",
                        original_transaction_id: "TEST",
                        product_id: "uk.co.guardian.gla.12months.2018Dec.withFreeTrial"
                        }
                    ],
                    status: 0
                }
            }
        }

        const expectedSubscriptionReferenceInSqs = {receipt: "TEST"};

        return parseStoreAndSend(input, parseApplePayload, applePayloadToDynamo, toAppleSqsEvent, mockFetchMetadataFunction, mockStoreFunction, mockSqsFunction).then(result => {
            expect(result).toStrictEqual(HTTPResponses.OK);
            expect(mockStoreFunction.mock.calls.length).toEqual(1);
            expect(mockStoreFunction.mock.calls[0][0]).toMatchObject(expectedSubscriptionEventInDynamo);
            expect(mockSqsFunction.mock.calls.length).toEqual(1);
            expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(expectedSubscriptionReferenceInSqs);
            expect(mockFetchMetadataFunction.mock.calls.length).toEqual(1);
        });
    });
});
