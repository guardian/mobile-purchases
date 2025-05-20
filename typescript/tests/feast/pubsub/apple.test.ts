import type { StatusUpdateNotification } from '../../../src/pubsub/apple-common';
import { parsePayload } from '../../../src/pubsub/apple-common';
import Mock = jest.Mock;
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { buildHandler } from '../../../src/feast/pubsub/apple';
import { HTTPResponses } from '../../../src/models/apiGatewayHttp';
import type { AppleSubscriptionReference } from '../../../src/models/subscriptionReference';

const buildApiGatewayEvent = (): APIGatewayProxyEvent => {
    const body: StatusUpdateNotification = {
        original_transaction_id: 'TEST',
        cancellation_date: 'TEST',
        web_order_line_item_id: 'TEST',
        auto_renew_adam_id: 'TEST',
        expiration_intent: 'TEST',
        auto_renew_product_id: 'uk.co.guardian.Feast.yearly',
        auto_renew_status: 'true',
        bid: 'uk.co.guardian.Feast',
        bvrs: 'TEST',
        environment: 'Sandbox',
        notification_type: 'INITIAL_BUY',
        unified_receipt: {
            environment: 'Sandbox',
            latest_receipt: 'TEST',
            latest_receipt_info: [
                {
                    app_item_id: 'TEST',
                    bvrs: 'TEST',
                    is_in_intro_offer_period: 'false',
                    is_trial_period: 'true',
                    item_id: 'TEST',
                    original_transaction_id: 'TEST',
                    product_id: 'some.product.id',
                    quantity: '1',
                    transaction_id: 'TEST',
                    unique_identifier: 'TEST',
                    unique_vendor_identifier: 'TEST',
                    version_external_identifier: 'TEST',
                    web_order_line_item_id: 'TEST',
                    purchase_date_ms: 'TEST',
                    original_purchase_date_ms: 'TEST',
                    expires_date: 'TEST',
                    expires_date_ms: 'TEST',
                },
            ],
            pending_renewal_info: [
                {
                    auto_renew_product_id: 'uk.co.guardian.Feast.yearly',
                    auto_renew_status: '1',
                    original_transaction_id: 'TEST',
                    product_id: 'uk.co.guardian.Feast.yearly',
                    price_consent_status: '',
                    price_increase_status: '',
                },
            ],
            status: 0,
        },
        promotional_offer_id: 'promotional_offer_id',
        promotional_offer_name: 'promotional_offer_name',
        product_id: 'product_id',
        purchase_date_ms: 0,
        expires_date_ms: 0,
    };

    return {
        body: JSON.stringify(body),
        headers: {},
        multiValueHeaders: {},
        httpMethod: 'POST',
        isBase64Encoded: false,
        path: '',
        pathParameters: {},
        queryStringParameters: { secret: 'test_secret' },
        multiValueQueryStringParameters: {},
        // @ts-expect-error
        requestContext: null,
        resource: '',
    };
};

beforeEach(() => {
    process.env['QueueUrl'] = '';
    process.env['Secret'] = 'test_secret';
});

describe('The Feast Apple pubsub', () => {
    it('Should return HTTP 200 and publish the event to SQS', async () => {
        const mockSqsFunction: Mock<Promise<any>, [string, AppleSubscriptionReference]> = jest.fn(
            (queueurl, event) => Promise.resolve({}),
        );
        const input = buildApiGatewayEvent();
        const expectedSubscriptionReferenceInSqs = { receipt: 'TEST' };

        const noOpLogger = (request: APIGatewayProxyEvent): void => {};
        const noOpStoreEventInDynamo = (event: StatusUpdateNotification): Promise<void> =>
            Promise.resolve();
        const handler = buildHandler(mockSqsFunction, noOpStoreEventInDynamo, noOpLogger);

        const result = await handler(input);

        expect(result).toStrictEqual(HTTPResponses.OK);
        expect(mockSqsFunction.mock.calls.length).toEqual(1);
        expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(expectedSubscriptionReferenceInSqs);
    });

    it('Should return HTTP 401 if secret is invalid', async () => {
        const mockSqsFunction: Mock<Promise<any>, [string, AppleSubscriptionReference]> = jest.fn(
            (queueurl, event) => Promise.resolve({}),
        );
        const input = buildApiGatewayEvent();
        input.queryStringParameters = {};

        const noOpLogger = (request: APIGatewayProxyEvent): void => {};
        const noOpStoreEventInDynamo = (event: StatusUpdateNotification): Promise<void> =>
            Promise.resolve();
        const handler = buildHandler(mockSqsFunction, noOpStoreEventInDynamo, noOpLogger);

        const result = await handler(input);

        expect(result).toStrictEqual(HTTPResponses.UNAUTHORISED);
    });

    it('invokes the method to add the event to the Dynamo table', async () => {
        const input = buildApiGatewayEvent();
        const sendMessageToSqs: Mock<Promise<any>, [string, AppleSubscriptionReference]> = jest.fn(
            (queueurl, event) => Promise.resolve({}),
        );
        const noOpLogger = (request: APIGatewayProxyEvent): void => {};
        const storeEventInDynamoMock = jest.fn(() => Promise.resolve());
        const handler = buildHandler(sendMessageToSqs, storeEventInDynamoMock, noOpLogger);

        const result = await handler(input);

        expect(result).toStrictEqual(HTTPResponses.OK);
        expect(storeEventInDynamoMock).toHaveBeenCalledTimes(1);
        expect(storeEventInDynamoMock).toHaveBeenCalledWith(parsePayload(input.body));
    });
});
