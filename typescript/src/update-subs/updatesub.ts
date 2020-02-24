import {SQSRecord} from 'aws-lambda'
import {Subscription} from '../models/subscription';
import {dynamoMapper, sendToSqs} from "../utils/aws";
import {ProcessingError} from "../models/processingError";

export function makeCancellationTime(cancellationTime: string) : string {
    if (cancellationTime) {
        return new Date(Number.parseInt(cancellationTime)).toISOString()
    } else {
        return ""
    }
}

export class SubscriptionUpdate {
    purchaseToken: string;
    startTimeMillis: string;
    expiryTimeMillis: string;
    userCancellationTimeMillis: string;
    autoRenewing: boolean;
    payload: any;

    constructor(purchaseToken: string, startTimeMillis: string, expiryTimeMillis: string, userCancellationTimeMillis: string, autoRenewing: boolean, payload: any) {
        this.purchaseToken = purchaseToken;
        this.startTimeMillis = startTimeMillis;
        this.expiryTimeMillis = expiryTimeMillis;
        this.userCancellationTimeMillis = userCancellationTimeMillis;
        this.autoRenewing = autoRenewing;
        this.payload = payload;
    }
}

function putSubscription(subscription: Subscription): Promise<Subscription> {
    return dynamoMapper.put({item: subscription}).then(result => result.item)
}

async function queueHistoricalSubscription(subscription: Subscription): Promise<void> {
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
        const subscriptions = await fetchSubscriberDetails(sqsRecord);
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
        } else {
           console.error("Unexpected error, will throw to retry: ", error);
           throw error;
        }
    }
}
