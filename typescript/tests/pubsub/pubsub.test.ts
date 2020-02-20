import { parseStoreAndSend } from "../../src/pubsub/pubsub";
import {
    parsePayload as parseGooglePayload,
    toDynamoEvent as googlePayloadToDynamo,
    toSqsSubReference as toGoogleSqsEvent
} from "../../src/pubsub/google";
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
            1582319167
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
