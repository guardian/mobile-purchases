import { SQSEvent, SQSRecord } from "aws-lambda";
import { getGoogleSubResponse } from "../../update-subs/google";
import { Subscription } from '../../models/subscription';
import { ProcessingError } from "../../models/processingError";
import { GracefulProcessingError } from "../../models/GracefulProcessingError";
import { putSubscription } from "../../update-subs/updatesub";

export const buildHandler = (
    fetchSubscriptionDetails: (record: SQSRecord) => Promise<Subscription[]>,
    putSubscription: (subscription: Subscription) => Promise<Subscription>,
): (event: SQSEvent) => Promise<string> => (async (event: SQSEvent) => { 
    const promises = event.Records.map(async (sqsRecord: SQSRecord) => {
        try {
            const subscriptions = await fetchSubscriptionDetails(sqsRecord); // Subscription[]
            await Promise.all(subscriptions.map(sub => putSubscription(sub)));

            console.log(`Processed ${subscriptions.length} subscriptions: ${subscriptions.map(s => s.subscriptionId)}`);

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
})

export const handler = buildHandler(
    getGoogleSubResponse,
    putSubscription,
);
