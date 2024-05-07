
import { SQSEvent } from "aws-lambda";
import { buildHandler, withAppAccountToken } from "../../../src/feast/update-subs/updatesubsRevalidation";
import { Subscription } from "../../../src/models/subscription";
import { AppleSubscriptionReference } from "../../../src/models/subscriptionReference";
import { UserSubscription } from "../../../src/models/userSubscription";
import { getIdentityIdFromBraze } from "../../../src/services/braze";
import { GracefulProcessingError } from "../../../src/models/GracefulProcessingError";

describe("The Feast (Apple) subscription updater", () => {
    it("Should fetch the subscription(s) associated with the reference from Apple and persist them to Dynamo", async () => {
        const event =
            buildSqsEvent(["TEST_RECEIPT_1", "TEST_RECEIPT_2"])

        const handler =
            buildHandler(
                stubFetchSubscriptionsFromApple,
                mockStoreSubscriptionInDynamo,
            )

        const result =
            await handler(event)

        // The receipts `"TEST_RECEIPT_1"` & `"TEST_RECEIPT_2"` together reference the subscriptions with IDs
        // `"sub-1"`, `"sub-2"` & `"sub-3"`. Importantly, `"sub-4"` is referenced by the receipt `"TEST_RECEIPT_3"`,
        // which is not present in the event payload and therefore not looked up and persisted to the Dynamo table.
        expect(mockStoreSubscriptionInDynamo.mock.calls.length).toEqual(3)

        const storedSubscriptionIds =
            mockStoreSubscriptionInDynamo.mock.calls.map(call => call[0].subscriptionId)

        expect(storedSubscriptionIds).toEqual(["sub-1", "sub-2", "sub-3"])
    });

    it("Does not throw an error if the receipt lookup with Apple fails with error code 21007", async () => {
        const event = buildSqsEvent(["LOOKUP_FAIL_RECEIPT"]);
        const fetchSubFromAppleFailure = (reference: AppleSubscriptionReference) => {
            throw new GracefulProcessingError(`Got status 21007 and we're in PROD`);
        }
        const handler =
            buildHandler(
                fetchSubFromAppleFailure,
                mockStoreSubscriptionInDynamo,
            );
        expect.assertions(1);

        await expect(handler(event)).resolves.toBe("OK");
    })
});

beforeEach(() => {
    mockStoreSubscriptionInDynamo.mockClear()
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

const subscription =
    (id: string, receipt: string, appAccountToken: string, identityId: string) => {
        return {
            subscription: withAppAccountToken(new Subscription(id, "", "", "", false, "", "ios-feast", false, "6M", null, receipt, null), appAccountToken),
            identityId: identityId
        }
    }

const subscriptions = [
    subscription("sub-1", "TEST_RECEIPT_1", "app-account-token-1", "identity-id-1"),
    subscription("sub-2", "TEST_RECEIPT_2", "app-account-token-2", "identity-id-2"),
    subscription("sub-3", "TEST_RECEIPT_2", "app-account-token-2", "identity-id-2"),
    subscription("sub-4", "TEST_RECEIPT_3", "app-account-token-3", "identity-id-3"),
]

const stubFetchSubscriptionsFromApple =
    (reference: AppleSubscriptionReference) => 
        Promise.resolve(subscriptions.filter(s => s.subscription.receipt == reference.receipt).map(s => s.subscription))

const mockStoreSubscriptionInDynamo =
    jest.fn((subscription: Subscription) => Promise.resolve())
