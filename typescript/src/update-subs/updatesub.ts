import { SQSRecord } from 'aws-lambda'
import { Subscription } from '../models/subscription';
import { dynamoMapper, sendToSqs } from "../utils/aws";
import { ProcessingError } from "../models/processingError";
import { GracefulProcessingError } from "../models/GracefulProcessingError";

export function putSubscription(subscription: Subscription): Promise<Subscription> {
    return dynamoMapper.put({item: subscription}).then(result => result.item)
}

export async function queueHistoricalSubscription(subscription: Subscription): Promise<void> {
    const queueUrl = process.env.HistoricalQueueUrl;
    if (queueUrl === undefined) throw new Error("No HistoricalQueueUrl env parameter provided");

    const payload = subscription.googlePayload ?? subscription.applePayload;
    if (payload) {
        await sendToSqs(queueUrl, {
            subscriptionId: subscription.subscriptionId,
            snapshotDate: (new Date()).toISOString(),
            payload
        });
    }
}

export async function parseAndStoreSubscriptionUpdate(
    sqsRecord: SQSRecord,
    fetchSubscriberDetails: (record: SQSRecord) => Promise<Subscription[]>
) : Promise<string> {
    try {
        console.log(`[fe022e81] ${JSON.stringify(sqsRecord)}`);
        const subscriptions = await fetchSubscriberDetails(sqsRecord); // Subscription[]
        console.log(`[cab3e079] ${JSON.stringify(subscriptions)}`);
        await Promise.all(subscriptions.map(putSubscription));
        await Promise.all(subscriptions.map(queueHistoricalSubscription));
        console.log(`[9922fe9d] Processed ${subscriptions.length} subscriptions: ${subscriptions.map(s => s.subscriptionId)}`);
        return "OK"
    } catch (error) {
        if (error instanceof ProcessingError) {
           console.error("[0336eccc] Error processing the subscription update", error);
           if (error.shouldRetry) {
               console.error("[1b15eaf3] Will throw an exception to retry this message");
               throw error;
           }  else {
               console.error("[5455bc19] The error wasn't retryable, giving up.");
               return "Error, giving up"
           }
        } else if(error instanceof GracefulProcessingError){
            console.warn("[277e4a4e] Error processing the subscription update is being handled gracefully", error);
            return "OK";
        } else {
           console.error("[eda52ca1] Unexpected error, will throw to retry: ", error);
           throw error;
        }
    }
}
