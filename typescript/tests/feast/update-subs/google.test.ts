import { buildHandler } from "../../../src/feast/update-subs/google";
import { Subscription } from "../../../src/models/subscription";
import type { UserSubscription } from "../../../src/models/userSubscription";
import { dateToSecondTimestamp, plusDays, thirtyMonths } from "../../../src/utils/dates";
import { buildSqsEvent } from "./test-helpers";

// Without this, the test error with: ENOENT: no such file or directory, open 'node:url'
// I'm not sure why.
jest.mock("../../../src/services/google-play-v2", () => jest.fn());

beforeEach(() => {
    process.env['HistoricalQueueUrl'] = "";
});

describe("The Feast Android subscription updater", () => {
    it("Should fetch the subscription associated with the reference from Google, persist to Dynamo and send to the historical queue", async () => {
        const packageName = "uk.co.guardian.feast";
        const purchaseToken = "test-purchase-token";
        const subscriptionId = "test-subscription-id";
        const event = buildSqsEvent([{
            packageName,
            purchaseToken,
            subscriptionId,
        }]);
        const startTime = plusDays(new Date(), -1);
        const expiryTime = plusDays(new Date(), 30);
        const googleSubscription = {
            startTime,
            expiryTime,
            userCancellationTime: null,
            autoRenewing: true,
            productId: subscriptionId,
            billingPeriodDuration: "P1M",
            freeTrial: false,
            testPurchase: false,
            obfuscatedExternalAccountId: "aaaa-bbbb-cccc-dddd",
            rawResponse: "test-raw-response",
        };
        const subscription = new Subscription(
            purchaseToken,
            startTime.toISOString(), // start date
            expiryTime.toISOString(), // expiry date
            undefined, // cancellation date
            true, // auto renewing
            subscriptionId,
            "android-feast",
            false, // free trial
            "P1M",
            googleSubscription,
            undefined, // receipt
            null, // apple payload
            dateToSecondTimestamp(thirtyMonths(googleSubscription.expiryTime)) // ttl
        );
        const identityId = "123456";
        const mockFetchSubscriptionsFromGoogle = jest.fn(() => Promise.resolve(googleSubscription));
        const mockStoreSubscriptionInDynamo = jest.fn((subscription: Subscription) => Promise.resolve(subscription))
        const mockSendSubscriptionToHistoricalQueue = jest.fn((subscription: Subscription) => Promise.resolve())
        const mockExchangeUuid = jest.fn((uuid: string) => Promise.resolve(identityId))
        const mockStoreUserSubInDynamo = jest.fn((userSub: UserSubscription) => Promise.resolve(undefined))
        const handler = buildHandler(
            mockFetchSubscriptionsFromGoogle,
            mockStoreSubscriptionInDynamo,
            mockSendSubscriptionToHistoricalQueue,
            mockExchangeUuid,
            mockStoreUserSubInDynamo
        );

        const result = await handler(event);

        expect(result).toEqual("OK");
        expect(mockFetchSubscriptionsFromGoogle).toHaveBeenCalledWith(purchaseToken, packageName);
        expect(mockStoreSubscriptionInDynamo.mock.calls.length).toEqual(1);
        expect(mockStoreSubscriptionInDynamo).toHaveBeenCalledWith(subscription);
        expect(mockSendSubscriptionToHistoricalQueue.mock.calls.length).toEqual(1);
        expect(mockSendSubscriptionToHistoricalQueue).toHaveBeenCalledWith(subscription);
        expect(mockExchangeUuid).toHaveBeenCalledWith(googleSubscription.obfuscatedExternalAccountId);
        expect(mockStoreUserSubInDynamo).toHaveBeenCalledWith(expect.objectContaining({
            userId: identityId,
            subscriptionId: purchaseToken,
        }));
    });

    it("Still persists to Dynamo and send to historical queue when no obfuscated id is available", async () => {
        const packageName = "uk.co.guardian.feast";
        const purchaseToken = "test-purchase-token";
        const subscriptionId = "test-subscription-id";
        const event = buildSqsEvent([{
            packageName,
            purchaseToken,
            subscriptionId,
        }]);
        const startTime = plusDays(new Date(), -1);
        const expiryTime = plusDays(new Date(), 30);
        const googleSubscription = {
            startTime,
            expiryTime,
            userCancellationTime: null,
            autoRenewing: true,
            productId: subscriptionId,
            billingPeriodDuration: "P1M",
            freeTrial: false,
            testPurchase: false,
            obfuscatedExternalAccountId: undefined,
            rawResponse: "test-raw-response",
        };
        const subscription = new Subscription(
            purchaseToken,
            startTime.toISOString(), // start date
            expiryTime.toISOString(), // expiry date
            undefined, // cancellation date
            true, // auto renewing
            subscriptionId,
            "android-feast",
            false, // free trial
            "P1M",
            googleSubscription,
            undefined, // receipt
            null, // apple payload
            dateToSecondTimestamp(thirtyMonths(googleSubscription.expiryTime)) // ttl
        );
        const identityId = "123456";
        const mockFetchSubscriptionsFromGoogle = jest.fn(() => Promise.resolve(googleSubscription));
        const mockStoreSubscriptionInDynamo = jest.fn((subscription: Subscription) => Promise.resolve(subscription))
        const mockSendSubscriptionToHistoricalQueue = jest.fn((subscription: Subscription) => Promise.resolve())
        const mockExchangeUuid = jest.fn((uuid: string) => Promise.resolve(identityId))
        const mockStoreUserSubInDynamo = jest.fn((userSub: UserSubscription) => Promise.resolve(undefined))
        const handler = buildHandler(
            mockFetchSubscriptionsFromGoogle,
            mockStoreSubscriptionInDynamo,
            mockSendSubscriptionToHistoricalQueue,
            mockExchangeUuid,
            mockStoreUserSubInDynamo
        );

        const result = await handler(event);

        expect(result).toEqual("OK");
        expect(mockFetchSubscriptionsFromGoogle).toHaveBeenCalledWith(purchaseToken, packageName);
        expect(mockStoreSubscriptionInDynamo.mock.calls.length).toEqual(1);
        expect(mockStoreSubscriptionInDynamo).toHaveBeenCalledWith(subscription);
        expect(mockSendSubscriptionToHistoricalQueue.mock.calls.length).toEqual(1);
        expect(mockSendSubscriptionToHistoricalQueue).toHaveBeenCalledWith(subscription);
        expect(mockStoreUserSubInDynamo).toBeCalledTimes(0);
    });
});
