import { parseStoreAndSend } from "../../src/pubsub/pubsub";
import {
    parsePayload as parseGooglePayload,
    toDynamoEvent as googlePayloadToDynamo,
    toSqsSubReference as toGoogleSqsEvent
} from "../../src/pubsub/google";
import {HTTPResponses} from "../../src/models/apiGatewayHttp";
import {SubscriptionEvent} from "../../src/models/subscriptionEvent";
import Mock = jest.Mock;

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
                data:'ewogICJ2ZXJzaW9uIjoiMS4wIiwKICAicGFja2FnZU5hbWUiOiJjb20uc29tZS50aGluZyIsCiAgImV2ZW50VGltZU1pbGxpcyI6IjE1MDMzNDk1NjYxNjgiLAogICJzdWJzY3JpcHRpb25Ob3RpZmljYXRpb24iOgogIHsKICAgICJ2ZXJzaW9uIjoiMS4wIiwKICAgICJub3RpZmljYXRpb25UeXBlIjo0LAogICAgInB1cmNoYXNlVG9rZW4iOiJQVVJDSEFTRV9UT0tFTiIsCiAgICAic3Vic2NyaXB0aW9uSWQiOiJteS5za3UiCiAgfQp9Cg==',
                messageId: '123',
                message_id: '123',
                publishTime: '2019-05-24T15:06:47.701Z',
                publish_time: '2019-05-24T15:06:47.701Z'
            },
            subscription: 'projects/guardian.co.uk:maximal-ceiling-820/subscriptions/mobile-pubsub-code'
        };
        const input = {queryStringParameters: {secret: "MYSECRET"}, body: JSON.stringify(body) };

        const expectedSubscriptionEventInDynamo: SubscriptionEvent = new SubscriptionEvent(
            "PURCHASE_TOKEN",
            "2017-08-21T21:06:06.168Z|SUBSCRIPTION_PURCHASED",
            "2017-08-21T21:06:06.168Z",
            "SUBSCRIPTION_PURCHASED",
            "android",
            "com.some.thing",
            {
                eventTimeMillis: "1503349566168",
                packageName: "com.some.thing",
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
            expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual({packageName: "com.some.thing", purchaseToken: "PURCHASE_TOKEN", subscriptionId: "my.sku"});

        });
    });
});
