import {SQSRecord} from 'aws-lambda'
import {Subscription} from '../models/subscription';
import {dynamoMapper, sendToSqs} from "../utils/aws";
import {ProcessingError} from "../models/processingError";
import {GracefulProcessingError} from "../models/GracefulProcessingError";

function putSubscription(subscription: Subscription): Promise<Subscription> {
    return dynamoMapper.put({item: subscription}).then(result => result.item)
}

async function queueHistoricalSubscription(subscription: Subscription): Promise<void> {
    const queueUrl = process.env.HistoricalQueueUrl;
    if (queueUrl === undefined) throw new Error("No HistoricalQueueUrl env parameter provided");

    const payload = subscription.googlePayload ?? subscription.applePayload;
    if (payload) {
        console.log(`[0e22c3c2] ${payload}`);
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
        const subscriptions = await fetchSubscriberDetails(sqsRecord); // Subscription[]
        await Promise.all(subscriptions.map(putSubscription));
        await Promise.all(subscriptions.map(queueHistoricalSubscription));
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
}
