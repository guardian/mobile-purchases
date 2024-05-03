import { APIGatewayProxyEvent } from "aws-lambda";
import { buildHandler } from "../../../src/feast/pubsub/google";
import { HTTPResponses } from "../../../src/models/apiGatewayHttp";

const buildApiGatewayEvent = (): APIGatewayProxyEvent => {
    const receivedEvent = {
        "version":"1.0",
        "packageName":"uk.co.guardian.feast.test",
        "eventTimeMillis":"1503349566168",
        "subscriptionNotification":
            {
                "version":"1.0",
                "notificationType":4,
                "purchaseToken":"PURCHASE_TOKEN",
                "subscriptionId":"uk.co.guardian.feast.access.test"
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
        subscription: 'projects/guardian.co.uk/subscriptions/feast-in-app-subscription-test'
    };

    return {
        body: JSON.stringify(body),
        headers: {},
        multiValueHeaders: {},
        httpMethod: "POST",
        isBase64Encoded: false,
        path: '',
        pathParameters: {},
        queryStringParameters: {secret: "test_secret"},
        multiValueQueryStringParameters: {},
        // @ts-ignore
        requestContext: null,
        resource: '',
    };
};

beforeEach(() => {
    process.env['QueueUrl'] = "";
    process.env['Secret'] = "test_secret";
});

describe("The Feast Google pubsub", () => {
    it("Should return HTTP 200", async () => {
        const input = buildApiGatewayEvent();

        const handler = buildHandler();

        const result = await handler(input);

        expect(result).toStrictEqual(HTTPResponses.OK);
    });

    it("Should return HTTP 401 if secret is invalid", async () => {
        const input = buildApiGatewayEvent();
        input.queryStringParameters = {};

        const handler = buildHandler();

        const result = await handler(input);

        expect(result).toStrictEqual(HTTPResponses.UNAUTHORISED);
    });
});
