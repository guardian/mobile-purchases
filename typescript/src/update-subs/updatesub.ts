import {SQSRecord} from 'aws-lambda'
import {Subscription} from '../models/subscription';
import {dynamoMapper} from "../utils/aws";
import {ONE_YEAR_IN_SECONDS} from "../pubsub/pubsub";
import {ProcessingError} from "../models/processingError";

export function makeCancellationTime(cancellationTime: string) : string {
    if (cancellationTime) {
        return new Date(Number.parseInt(cancellationTime)).toISOString()
    } else {
        return ""
    }
}

export function makeTimeToLive(date: Date) {
    return Math.ceil((date.getTime() / 1000) + 7 * ONE_YEAR_IN_SECONDS)
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

function putSubscription(subscription: Subscription): Promise<Subscription>  {
    return dynamoMapper.put({item: subscription}).then(result => result.item)
}

export async function parseAndStoreSubscriptionUpdate (
    sqsRecord: SQSRecord,
    fetchSubscriberDetails: (record: SQSRecord) => Promise<Subscription>,
) : Promise<String> {
    return fetchSubscriberDetails(sqsRecord)
        .then(payload => {
            putSubscription(payload);
            return "OK"
        })
        .catch(error => {
            if (error instanceof ProcessingError) {
               console.error("Error processing the subscription update", error);
               if (error.shouldRetry) {
                   console.error("Will throw an exception to retry this message");
                   throw error;
               }  else {
                   return "Error, giving up"
               }
            } else {
               console.error("Unexpected error, will throw to retry: ", error);
               throw error;
            }
        });

}
