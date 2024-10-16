import {googleSQSRecord, googleSubscriptionId} from "./test-fixtures";
import {handler} from "../../../src/feast/acquisition-events/google";
import {Platform} from "../../../src/models/platform";


describe("The Feast Google Acquisition Event", () => {
    it("Should return the appropriate message", async () => {
        const result = await handler(googleSQSRecord);

        expect(result).toStrictEqual([`Feast Google Acquisition Events Lambda has been called for subscriptionId: ${googleSubscriptionId} with platform: ${Platform.AndroidFeast}`]);
    });
});