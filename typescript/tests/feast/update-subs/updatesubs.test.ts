
import { SQSEvent } from "aws-lambda";
import { SubscriptionMaybeWithAppAccountToken, buildHandler, withAppAccountToken } from "../../../src/feast/update-subs/apple";
import { Subscription } from "../../../src/models/subscription";
import { AppleSubscriptionReference } from "../../../src/models/subscriptionReference";
import { UserSubscription } from "../../../src/models/userSubscription";
import { GracefulProcessingError } from "../../../src/models/GracefulProcessingError";
import { ProcessingError } from "../../../src/models/processingError";

describe("The Feast (Apple) subscription updater", () => {
    it("Should fetch the subscription(s) associated with the reference from Apple and persist them to Dynamo", async () => {
        const event =
            buildSqsEvent(["TEST_RECEIPT_1", "TEST_RECEIPT_2"])

        const handler =
            buildHandler(
                stubFetchSubscriptionsFromApple,
                mockStoreSubscriptionInDynamo,
                stubExchangeExternalIdForIdentityId,
                mockStoreUserSubscriptionInDynamo
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

    it("Should lookup the identity ID associated with the subscription and persist the relationship to Dynamo", async () => {
        const event =
            buildSqsEvent(["TEST_RECEIPT_1", "TEST_RECEIPT_2"])

        const handler =
            buildHandler(
                stubFetchSubscriptionsFromApple,
                mockStoreSubscriptionInDynamo,
                stubExchangeExternalIdForIdentityId,
                mockStoreUserSubscriptionInDynamo
            )

        const result =
            await handler(event)

        expect(mockStoreUserSubscriptionInDynamo.mock.calls.length).toEqual(3)

        const storedUserSubscriptions =
            mockStoreUserSubscriptionInDynamo.mock.calls.map(call => {
                return {
                    userId: call[0].userId,
                    subscriptionId: call[0].subscriptionId
                }
            })

        const expectedUserSubscriptions =
            [
                { subscriptionId: "sub-1", userId: "identity-id-1" },
                { subscriptionId: "sub-2", userId: "identity-id-2" },
                { subscriptionId: "sub-3", userId: "identity-id-2" },
            ]

        expect(storedUserSubscriptions).toEqual(expectedUserSubscriptions)
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
                stubExchangeExternalIdForIdentityId,
                mockStoreUserSubscriptionInDynamo
            );
        expect.assertions(1);

        await expect(handler(event)).resolves.toBe("OK");
    })

    it("Throws an error if the receipt has no app account token, but still writes the subscription", async () => {
        expect.assertions(2);
        const event =
            buildSqsEvent(["TEST_RECEIPT_MISSING_AAT"])
        const handler =
            buildHandler(
                stubFetchSubscriptionsFromApple,
                mockStoreSubscriptionInDynamo,
                stubExchangeExternalIdForIdentityId,
                mockStoreUserSubscriptionInDynamo
            )

        try {
            await handler(event);
        } catch (error) {
            expect((error as ProcessingError).message)
                .toMatch("Subscription with receipt 'TEST_RECEIPT_MISSING_AAT' did not have an 'appAccountToken'");
            expect(mockStoreSubscriptionInDynamo.mock.calls.length).toEqual(1)
        }
    })
});

beforeEach(() => {
    mockStoreSubscriptionInDynamo.mockClear()
    mockStoreUserSubscriptionInDynamo.mockClear()
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
    (
        id: string,
        receipt: string,
        appAccountToken?: string,
        identityId?: string
    ): { subscription: SubscriptionMaybeWithAppAccountToken, identityId?: string } => {
        const subscription = new Subscription(id, "", "", "", false, "", "ios-feast", false, "6M", null, receipt, null);
        return {
            subscription: appAccountToken ? withAppAccountToken(subscription, appAccountToken): subscription,
            identityId: identityId
        }
    }

const subscriptions = [
    subscription("sub-1", "TEST_RECEIPT_1", "app-account-token-1", "identity-id-1"),
    subscription("sub-2", "TEST_RECEIPT_2", "app-account-token-2", "identity-id-2"),
    subscription("sub-3", "TEST_RECEIPT_2", "app-account-token-2", "identity-id-2"),
    subscription("sub-4", "TEST_RECEIPT_3", "app-account-token-3", "identity-id-3"),
    subscription("sub-5", "TEST_RECEIPT_MISSING_AAT", undefined, undefined),
]

const stubFetchSubscriptionsFromApple =
    (reference: AppleSubscriptionReference) =>
        Promise.resolve(subscriptions.filter(s => s.subscription.receipt == reference.receipt).map(s => s.subscription))

const stubExchangeExternalIdForIdentityId =
    (externalId: string) => {
        const maybeMatchingSub = subscriptions.find(s => s.subscription.appAccountToken == externalId)

        if (maybeMatchingSub) {
            return Promise.resolve(subscriptions.find(s => s.subscription.appAccountToken == externalId)?.identityId!)
        }

        return Promise.reject(`Failed to exchange app account token ${externalId} for identity ID`)
    }

const mockStoreSubscriptionInDynamo =
    jest.fn((subscription: Subscription) => Promise.resolve())

const mockStoreUserSubscriptionInDynamo =
    jest.fn((userSubscription: UserSubscription) => Promise.resolve())
