import {appleSQSRecord, appleSubscriptionId} from "./test-fixtures";
import {handler} from "../../../src/feast/acquisition-events/apple";
import {Platform} from "../../../src/models/platform";


describe("The Feast Google Acquisition Event", () => {
    it("Should return the appropriate message", async () => {
        const result = await handler(appleSQSRecord);

        expect(result).toStrictEqual([`Feast Google Acquisition Events Lambda has been called for subscriptionId: ${appleSubscriptionId} with platform: ${Platform.IosFeast}`]);
    });
});