import {SQSRecord} from 'aws-lambda'
import {Subscription} from '../models/subscription';
import {dynamoMapper} from "../utils/aws";
import {ONE_YEAR_IN_SECONDS} from "../pubsub/pubsub";
import {AccessToken} from "../utils/google-play";

function makeCancellationTime(cancellationTime: string) : string {
    if (cancellationTime) {
        return new Date(Number.parseInt(cancellationTime)).toISOString()
    } else {
        return ""
    }
}

function makeTimeToLive(date: Date) {
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


function makeSubscription(subscriptionUpdate: SubscriptionUpdate) {
    const subscription = new Subscription(
        subscriptionUpdate.purchaseToken,
        new Date(Number.parseInt(subscriptionUpdate.startTimeMillis)).toISOString(),
        new Date(Number.parseInt(subscriptionUpdate.expiryTimeMillis)).toISOString(),
        makeCancellationTime(subscriptionUpdate.userCancellationTimeMillis),
        subscriptionUpdate.autoRenewing,
        subscriptionUpdate,
        makeTimeToLive(new Date(Date.now()))
    );
    return subscription;
}

function putSubscription(subscriptionUpdate: SubscriptionUpdate): Promise<Subscription>  {
    const subscription = makeSubscription(subscriptionUpdate);
    return dynamoMapper.put({item: subscription}).then(result => result.item)
}


export async function parseAndStoreSubscriptionUpdate (
    sqsRecord: SQSRecord,
    fetchSubscriberDetails: (record: SQSRecord) => Promise<SubscriptionUpdate>
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
