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
    if (subscription.googlePayload) {
        const queueUrl = process.env.GoogleHistoricalUrl;
        if (queueUrl === undefined) throw new Error("No GoogleHistoricalUrl env parameter provided");
        await sendToSqs(queueUrl, subscription.googlePayload);
    }
    if (subscription.applePayload) {
        const queueUrl = process.env.AppleHistoricalUrl;
        if (queueUrl === undefined) throw new Error("No AppleHistoricalUrl env parameter provided");
        await sendToSqs(queueUrl, subscription.applePayload);
    }
}

export async function parseAndStoreSubscriptionUpdate (
    sqsRecord: SQSRecord,
    fetchSubscriberDetails: (record: SQSRecord) => Promise<Subscription>,
) : Promise<String> {
    try {
        const subscription = await fetchSubscriberDetails(sqsRecord);
        await putSubscription(subscription);
        await queueHistoricalSubscription(subscription);
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
