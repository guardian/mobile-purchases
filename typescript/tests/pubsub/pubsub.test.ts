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

        const mockStoreFunction: Mock<Promise<SubscriptionEvent>, [SubscriptionEvent]>  = jest.fn((event) => {
            return new Promise((resolve, reject) => {
                resolve(event);
            });
        });

        const mockSqsFunction: Mock<Promise<any>, [string, {purchaseToken: string}]>  = jest.fn((queurl, event) => {
            return new Promise((resolve, reject) => {
                resolve({});
            });
        });

        const body = {
            message: {
                data:'ewogICJ2ZXJzaW9uIjoiMS4wIiwKICAicGFja2FnZU5hbWUiOiJjb20uZ3VhcmRpYW4uZGVidWciLAogICJldmVudFRpbWVNaWxsaXMiOiIxNTAzMzQ5NTY2MTY4IiwKICAic3Vic2NyaXB0aW9uTm90aWZpY2F0aW9uIjoKICB7CiAgICAidmVyc2lvbiI6IjEuMCIsCiAgICAibm90aWZpY2F0aW9uVHlwZSI6NCwKICAgICJwdXJjaGFzZVRva2VuIjoiUFVSQ0hBU0VfVE9LRU4iLAogICAgInN1YnNjcmlwdGlvbklkIjoibXkuc2t1IgogIH0KfQo=',
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

        return parseStoreAndSend(input, parseGooglePayload, googlePayloadToDynamo, toGoogleSqsEvent, mockStoreFunction, mockSqsFunction).then(result => {
            expect(result).toStrictEqual(HTTPResponses.OK);
            expect(mockStoreFunction.mock.calls.length).toEqual(1);
            expect(mockStoreFunction.mock.calls[0][0]).toStrictEqual(expectedSubscriptionEventInDynamo);
            expect(mockSqsFunction.mock.calls.length).toEqual(1);
            expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual({packageName: "com.guardian.debug", purchaseToken: "PURCHASE_TOKEN", subscriptionId: "my.sku"});
        });
    });
});
