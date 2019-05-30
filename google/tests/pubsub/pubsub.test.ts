import { parseAndStore } from "../../src/pubsub/pubsub";
import {HTTPResponses} from "../../src/models/apiGatewayHttp";
import {SubscriptionEvent} from "../../src/models/subscriptionEvent";
import Mock = jest.Mock;

test("Should return HTTP 200 and store the correct data in dynamo", () => {
    process.env['Secret'] = "MYSECRET";

    const mockStoreFunction: Mock<Promise<SubscriptionEvent>, SubscriptionEvent[]>  = jest.fn((event) => {
        return new Promise((resolve, reject) => {
            resolve(event);
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
        "2017-08-21T21:06:06.168Z|4",
        "2017-08-21T21:06:06.168Z",
        "SUBSCRIPTION_PURCHASED",
        "android",
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
        1724252767
    );

    return parseAndStore(input, mockStoreFunction).then(result => {
        expect(result).toStrictEqual(HTTPResponses.OK);
        expect(mockStoreFunction.mock.calls.length).toEqual(1);
        expect(mockStoreFunction.mock.calls[0][0]).toStrictEqual(expectedSubscriptionEventInDynamo);
    });
});
