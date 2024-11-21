import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { Subscription } from "../../models/subscription";
import { GoogleSubscription, fetchGoogleSubscriptionV2 } from "../../services/google-play-v2";
import { googlePackageNameToPlatform } from "../../services/appToPlatform";
import { dateToSecondTimestamp, thirtyMonths } from "../../utils/dates";

// This function is duplicated from the copy in src/update-subs/google.ts
// This will be corrected in the future refactoring

const googleSubscriptionToSubscription = (
    purchaseToken: string,
    packageName: string,
    googleSubscription: GoogleSubscription
): Subscription => {
    return new Subscription(
        purchaseToken,
        googleSubscription.startTime?.toISOString() ?? "",
        googleSubscription.expiryTime.toISOString(),
        googleSubscription.userCancellationTime?.toISOString(),
        googleSubscription.autoRenewing,
        googleSubscription.productId,
        googlePackageNameToPlatform(packageName),
        googleSubscription.freeTrial,
        googleSubscription.billingPeriodDuration,
        googleSubscription,
        undefined,
        null,
        dateToSecondTimestamp(thirtyMonths(googleSubscription.expiryTime)),
    )
};

const processSQSRecord = async (record: SQSRecord): Promise<void> => {
    console.log(`[48bb04a0] calling processRecord (Google version) with record ${JSON.stringify(record)}`);
    const subscriptionFromQueue: Subscription = JSON.parse(record.body);
    console.log(`[cf7fd559] subscriptionFromQueue: ${JSON.stringify(subscriptionFromQueue)}`);
    // We are now collecting the the data required to query the Google Play API (v2) for subscription details
    const purchaseToken = subscriptionFromQueue.subscriptionId;
    const packageName = "uk.co.guardian.feast";
    const subscriptionFromGoogle = await fetchGoogleSubscriptionV2(purchaseToken, packageName);
    console.log(`[4fe9b14b] subscriptionFromGoogle: ${JSON.stringify(subscriptionFromGoogle)}`);
    const subscriptionUpdated: Subscription = googleSubscriptionToSubscription(purchaseToken, packageName, subscriptionFromGoogle);
    console.log(`[2ba4a5a7] subscriptionUpdated: ${JSON.stringify(subscriptionUpdated)}`);
}

export const handler = async (event: SQSEvent): Promise<void> => {
    console.log('[e01d21bb] Feast Google Acquisition Events Lambda has been called');
    console.log(`[8b8b51a5] Processing ${event.Records.length} records`);
    const promises = event.Records.map( async (record: SQSRecord) => {
        await processSQSRecord(record)
    });
    await Promise.all(promises);
    console.log('[a2231ca1] Finished processing records');
}