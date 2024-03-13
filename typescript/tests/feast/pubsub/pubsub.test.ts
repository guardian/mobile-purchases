import { StatusUpdateNotification } from "../../../src/pubsub/apple";
import Mock = jest.Mock;
import { APIGatewayProxyEvent } from "aws-lambda";
import { processEvent } from "../../../src/feast/pubsub/pubsub";
import { HTTPResponses } from "../../../src/models/apiGatewayHttp";

describe("The Feast Apple pubsub", () => {
    test("Should return HTTP 200 and publish the event to SQS", () => {
        process.env['QueueUrl'] = "";

        const mockSqsFunction: Mock<Promise<any>, [string, {receipt: string}]> = jest.fn((queueurl, event) => Promise.resolve({}));

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
            },
            promotional_offer_id: "promotional_offer_id",
            promotional_offer_name: "promotional_offer_name",
            product_id: "product_id",
            purchase_date_ms: 0,
            expires_date_ms: 0
        }

        const input: APIGatewayProxyEvent = {
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

        }

        const expectedSubscriptionReferenceInSqs = {receipt: "TEST"};

        return processEvent(mockSqsFunction)(input).then(result => {
            expect(result).toStrictEqual(HTTPResponses.OK);
            expect(mockSqsFunction.mock.calls.length).toEqual(1);
            expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(expectedSubscriptionReferenceInSqs);
        });
    });
});
