import { buildHandler } from "../../../src/feast/update-subs/google";
import { Subscription } from "../../../src/models/subscription";
import { GoogleResponseBody } from "../../../src/services/google-play";
import { plusDays } from "../../../src/utils/dates";
import { buildSqsEvent } from "./test-helpers";

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
        const subscriptionFromGoogle: GoogleResponseBody = {
            autoRenewing: true,
            expiryTimeMillis: plusDays(new Date(), 30).getTime().toString(),
            paymentState: 1,
            startTimeMillis: plusDays(new Date(), -1).getTime().toString(),
            userCancellationTimeMillis: "",
        };
        const subscription = new Subscription(
            purchaseToken,
            plusDays(new Date(), -1).toISOString(), // start date
            plusDays(new Date(), 30).toISOString(), // expiry date
            undefined, // cancellation date
            true, // auto renewing
            subscriptionId,
            "android-feast",
            false, // free trial
            "monthly",
            subscriptionFromGoogle,
            undefined, // receipt
            null, // apple payload
            undefined,
        );
        const stubFetchSubscriptionsFromGoogle = () => Promise.resolve([subscription]);
        const mockStoreSubscriptionInDynamo = jest.fn((subscription: Subscription) => Promise.resolve(subscription))
        const handler = buildHandler(
            stubFetchSubscriptionsFromGoogle,
            mockStoreSubscriptionInDynamo,
        );

        const result = await handler(event);

        expect(result).toEqual("OK");
        expect(mockStoreSubscriptionInDynamo.mock.calls.length).toEqual(1);
        expect(mockStoreSubscriptionInDynamo).toHaveBeenCalledWith(subscription);
    });
});
