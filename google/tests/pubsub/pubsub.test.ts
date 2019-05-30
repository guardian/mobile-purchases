import { handler } from "../../src/pubsub/pubsub";
import {HTTPResponses} from "../../src/models/apiGatewayHttp";

test("Should return HTTP 200", () => {
    process.env['Secret'] = "MYSECRET";
    expect.assertions(1);
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

    return handler(input).then(result => expect(result).toStrictEqual(HTTPResponses.OK));
});
