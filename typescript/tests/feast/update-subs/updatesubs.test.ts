
import { SQSEvent } from "aws-lambda";
import { buildHandler } from "../../../src/feast/update-subs/updatesubs";
import { Subscription } from "../../../src/models/subscription";
import { AppleSubscriptionReference } from "../../../src/models/subscriptionReference";

describe("The Feast (Apple) subscription updater", () => {
    it("Should fetch the subscription(s) associated with the reference from Apple and persist them to Dynamo", async () => {
        const event =
            buildSqsEvent(["TEST_RECEIPT_1", "TEST_RECEIPT_2"])

        const handler =
            buildHandler(stubFetchSubscriptionsFromApple, mockStoreSubscriptionInDynamo)

        const result =
            await handler(event)

        expect(mockStoreSubscriptionInDynamo.mock.calls.length).toEqual(3)

        const storedSubscriptionIds =
            mockStoreSubscriptionInDynamo.mock.calls.map(call => call[0].subscriptionId)

        // The receipts `"TEST_RECEIPT_1"` & `"TEST_RECEIPT_2"` together reference the subscriptions with IDs
        // `"sub-1"`, `"sub-2"` & `"sub-3"`. Importantly, `"sub-4"` is referenced by the receipt `"TEST_RECEIPT_3"`,
        // which is not present in the event payload and therefore not looked up and persisted to the Dynamo table.
        expect(storedSubscriptionIds).toEqual(["sub-1", "sub-2", "sub-3"])
    });
});

const buildSqsEvent = (receipts: string[]): SQSEvent => {
    const records = receipts.map(receipt =>
    ({
        messageId: "",
        receiptHandle: "",
        body: JSON.stringify({ receipt: receipt }),
        attributes: {
            ApproximateReceiveCount: "",
            SentTimestamp: "",
            SenderId: "",
            ApproximateFirstReceiveTimestamp: "",
        },
        messageAttributes: {},
        md5OfBody: "",
        eventSource: "",
        eventSourceARN: "",
        awsRegion: "",
    }))

    return {
        Records: records
    }
}

const mockStoreSubscriptionInDynamo =
    jest.fn((subscription: Subscription) => Promise.resolve());

const stubFetchSubscriptionsFromApple =
    (reference: AppleSubscriptionReference) => Promise.resolve(subscriptions.filter(s => s.receipt == reference.receipt));

const subscription =
    (id: string, product: string, receipt: string) =>
        new Subscription(id, "", "", "", false, product, "ios-feast", false, "6M", null, receipt, null)

const subscriptions = [
    subscription( "sub-1", "prod-1", "TEST_RECEIPT_1"),
    subscription( "sub-2", "prod-1", "TEST_RECEIPT_2"),
    subscription( "sub-3", "prod-2", "TEST_RECEIPT_2"),
    subscription( "sub-4", "prod-1", "TEST_RECEIPT_3")
]
