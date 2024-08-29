import { SQSEvent, SQSRecord } from "aws-lambda";
import { Subscription } from '../../models/subscription';
import { ProcessingError } from "../../models/processingError";
import { GracefulProcessingError } from "../../models/GracefulProcessingError";
import { putSubscription } from "../../update-subs/updatesub";
import { GoogleSubscription, fetchGoogleSubscriptionV2 } from "../../services/google-play-v2";
import { GoogleSubscriptionReference } from "../../models/subscriptionReference";
import { fromGooglePackageName } from "../../services/appToPlatform";
import { dateToSecondTimestamp, optionalMsToDate, thirtyMonths } from "../../utils/dates";
import { getIdentityIdFromBraze } from "../../services/braze";
import { storeUserSubscriptionInDynamo, queueHistoricalSubscription } from "./common";
import { UserSubscription } from "../../models/userSubscription";
import { fetchGoogleSubscription, GOOGLE_PAYMENT_STATE, GoogleResponseBody } from "../../services/google-play";

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

const googleResponseBodyToSubscription = (
    purchaseToken: string,
    packageName: string,
    subscriptionId: string,
    billingPeriod: string,
    googleResponse: GoogleResponseBody | null
): Subscription => {
    if (!googleResponse) {
        throw new ProcessingError("There was no data in the response from google", true);
    }

    const expiryDate = optionalMsToDate(googleResponse.expiryTimeMillis);
    if (expiryDate === null) {
        throw new ProcessingError(`Unable to parse the expiryTimeMillis field ${googleResponse.expiryTimeMillis}`, false)
    }

    const startDate = optionalMsToDate(googleResponse.startTimeMillis);
    if (startDate === null) {
        throw new ProcessingError(`Unable to parse the startTimeMillis field ${googleResponse.startTimeMillis}`, false)
    }

    const freeTrial = googleResponse.paymentState === GOOGLE_PAYMENT_STATE.FREE_TRIAL;
    return new Subscription(
        purchaseToken,
        startDate.toISOString(),
        expiryDate.toISOString(),
        optionalMsToDate(googleResponse.userCancellationTimeMillis)?.toISOString(),
        googleResponse.autoRenewing,
        subscriptionId,
        fromGooglePackageName(packageName)?.toString(),
        freeTrial,
        billingPeriod,
        googleResponse,
        undefined,
        null,
        dateToSecondTimestamp(thirtyMonths(expiryDate)),
    );
}

export const buildHandler = (
    fetchSubscriptionDetails: (purchaseToken: string, packageName: string) => Promise<GoogleSubscription>,
    fetchSubscriptionDetailsV1: (subscriptionId: string, purchaseToken: string, packageName: string) => Promise<GoogleResponseBody | null>,
    putSubscription: (subscription: Subscription) => Promise<Subscription>,
    sendSubscriptionToHistoricalQueue: (subscription: Subscription) => Promise<void>,
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

            // We need a subscription in the format from the "V1" endpoint from Google to fit the historical table
            const googleResponseV1 = await fetchSubscriptionDetailsV1(subRef.subscriptionId, subRef.purchaseToken, subRef.packageName);
            const subscriptionV1 = googleResponseBodyToSubscription(subRef.purchaseToken, subRef.packageName, subRef.subscriptionId, subscriptionFromGoogle.billingPeriodDuration, googleResponseV1);
            await sendSubscriptionToHistoricalQueue(subscriptionV1);

            if (subscriptionFromGoogle.obfuscatedExternalAccountId) {
                const identityId = await exchangeExternalIdForIdentityId(subscriptionFromGoogle.obfuscatedExternalAccountId);
                console.log("Successfully exchanged UUID for identity ID");
    
                const userSubscription = new UserSubscription(identityId, subscription.subscriptionId, new Date().toISOString());
                await storeUserSubInDynamo(userSubscription);
    
                console.log(`Processed subscription: ${subscription.subscriptionId}`); 
            }
            else {
                console.log(`Subscription ${subscription.subscriptionId} does not contain an external account ID`)
            }

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
    fetchGoogleSubscription,
    putSubscription,
    queueHistoricalSubscription,
    getIdentityIdFromBraze,
    storeUserSubscriptionInDynamo,
);
