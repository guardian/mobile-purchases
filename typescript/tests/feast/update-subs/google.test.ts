import { buildHandler } from "../../../src/feast/update-subs/google";
import { Subscription } from "../../../src/models/subscription";
import { dateToSecondTimestamp, plusDays, thirtyMonths } from "../../../src/utils/dates";
import { buildSqsEvent } from "./test-helpers";

// Without this, the test error with: ENOENT: no such file or directory, open 'node:url'
// I'm not sure why.
jest.mock("../../../src/services/google-play-v2", () => jest.fn());

describe("The Feast Android subscription updater", () => {
    it("Should fetch the subscription associated with the reference from Google and persist to Dynamo", async () => {
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
        const mockFetchSubscriptionsFromGoogle = jest.fn(() => Promise.resolve(googleSubscription));
        const mockStoreSubscriptionInDynamo = jest.fn((subscription: Subscription) => Promise.resolve(subscription))
        const mockExchangeUuid = jest.fn((uuid: string) => Promise.resolve('123456'))
        const handler = buildHandler(
            mockFetchSubscriptionsFromGoogle,
            mockStoreSubscriptionInDynamo,
            mockExchangeUuid,
        );

        const result = await handler(event);

        expect(result).toEqual("OK");
        expect(mockFetchSubscriptionsFromGoogle).toHaveBeenCalledWith(purchaseToken, packageName);
        expect(mockStoreSubscriptionInDynamo.mock.calls.length).toEqual(1);
        expect(mockStoreSubscriptionInDynamo).toHaveBeenCalledWith(subscription);
        expect(mockExchangeUuid).toHaveBeenCalledWith(googleSubscription.obfuscatedExternalAccountId);
    });
});
