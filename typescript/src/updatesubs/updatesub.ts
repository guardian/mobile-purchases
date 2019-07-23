import {SQSRecord} from 'aws-lambda'
import {GoogleSubscription, Subscription} from '../models/subscription';
import {dynamoMapper} from "../utils/aws";
import {ONE_YEAR_IN_SECONDS} from "../pubsub/pubsub";
import {AccessToken} from "../utils/google-play";

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
    console.log(`+++++++++++ Sub: ${JSON.stringify(subscription)}`)
    return dynamoMapper.put({item: subscription}).then(result => result.item)
}

export async function parseAndStoreSubscriptionUpdate (
    sqsRecord: SQSRecord,
    fetchSubscriberDetails: (record: SQSRecord) => Promise<Subscription>,
) : Promise<Subscription> {
   return fetchSubscriberDetails(sqsRecord)
       .then(payload => {
           return putSubscription(payload)
       } )
       .catch(
           error => {
               console.log(`Error retrieving payload from google: ${error}`)
               throw error
           }
       )

}
