import { SQSEvent, SQSRecord } from "aws-lambda";
import { Subscription } from '../../models/subscription';
import { ProcessingError } from "../../models/processingError";
import { GracefulProcessingError } from "../../models/GracefulProcessingError";
import { putSubscription } from "../../update-subs/updatesub";
import { GoogleSubscription, fetchGoogleSubscriptionV2 } from "../../services/google-play-v2";
import { GoogleSubscriptionReference } from "../../models/subscriptionReference";
import { fromGooglePackageName } from "../../services/appToPlatform";
import { dateToSecondTimestamp, thirtyMonths } from "../../utils/dates";
import { getIdentityIdFromBraze } from "../../services/braze";
import { storeUserSubscriptionInDynamo } from "./common";
import { UserSubscription } from "../../models/userSubscription";

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
        fromGooglePackageName(packageName),
        googleSubscription.freeTrial,
        googleSubscription.billingPeriodDuration,
        googleSubscription,
        undefined,
        null,
        dateToSecondTimestamp(thirtyMonths(googleSubscription.expiryTime)),
    )
};

export const buildHandler = (
    fetchSubscriptionDetails: (purchaseToken: string, packageName: string) => Promise<GoogleSubscription>,
    putSubscription: (subscription: Subscription) => Promise<Subscription>,
    exchangeExternalIdForIdentityId: (externalId: string) => Promise<string>,
    storeUserSubInDynamo: (userSub: UserSubscription) => Promise<void>,
) => (async (event: SQSEvent) => {
    const promises = event.Records.map(async (sqsRecord: SQSRecord) => {
        try {
            // TODO: parse this using zod to get validation
            const subRef = JSON.parse(sqsRecord.body) as GoogleSubscriptionReference;
            const subscriptionFromGoogle = await fetchSubscriptionDetails(subRef.purchaseToken, subRef.packageName);
            const subscription = googleSubscriptionToSubscription(subRef.purchaseToken, subRef.packageName, subscriptionFromGoogle);
            await putSubscription(subscription);

            if (!subscriptionFromGoogle.obfuscatedExternalAccountId) {
                throw new ProcessingError(`Subscription ${subscription.subscriptionId} does not contain an external account ID`, true);
            }

            const identityId = await exchangeExternalIdForIdentityId(subscriptionFromGoogle.obfuscatedExternalAccountId);
            console.log("Successfully exchanged UUID for identity ID");

            const userSubscription = new UserSubscription(identityId, subscription.subscriptionId, new Date().toISOString());
            await storeUserSubInDynamo(userSubscription);

            console.log(`Processed subscription: ${subscription.subscriptionId}`);

            return "OK"
        } catch (error) {
            if (error instanceof ProcessingError) {
                console.error("Error processing the subscription update", error);

                if (error.shouldRetry) {
                    console.error("Will throw an exception to retry this message");
                    throw error;
                }  else {
                    console.error("The error wasn't retryable, giving up.");
                    return "Error, giving up"
                }
            } else if(error instanceof GracefulProcessingError){
                console.warn("Error processing the subscription update is being handled gracefully", error);

                return "OK";
            } else {
                console.error("Unexpected error, will throw to retry: ", error);

                throw error;
            }
        }
    });

    return Promise.all(promises)
        .then(_  => "OK")
});

export const handler = buildHandler(
    fetchGoogleSubscriptionV2,
    putSubscription,
    getIdentityIdFromBraze,
    storeUserSubscriptionInDynamo,
);
