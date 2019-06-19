import {SQSRecord} from 'aws-lambda'
import {Subscription} from '../models/subscription';
import {dynamoMapper} from "../utils/aws";
import {ONE_YEAR_IN_SECONDS} from "../pubsub/pubsub";

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
    cancellationTimeMillis: string;
    autoRenewing: boolean;
    payload: any;

    constructor(purchaseToken: string, startTimeMillis: string, expiryTimeMillis: string, cancellationTimeMillis: string, autoRenewing: boolean, payload: any) {
        this.purchaseToken = purchaseToken;
        this.startTimeMillis = startTimeMillis;
        this.expiryTimeMillis = expiryTimeMillis;
        this.cancellationTimeMillis = cancellationTimeMillis;
        this.autoRenewing = autoRenewing;
        this.payload = payload;
    }
}


function makeSubscription(subscriptionUpdate: SubscriptionUpdate) {
    const subscription = new Subscription(
        subscriptionUpdate.purchaseToken,
        new Date(Number.parseInt(subscriptionUpdate.startTimeMillis)).toISOString(),
        new Date(Number.parseInt(subscriptionUpdate.expiryTimeMillis)).toISOString(),
        makeCancellationTime(subscriptionUpdate.cancellationTimeMillis),
        subscriptionUpdate.autoRenewing,
        subscriptionUpdate,
        makeTimeToLive(new Date(Date.now()))
    );
    return subscription;
}

function getSubscription(purchaseToken: string): Promise<Subscription> {
    return dynamoMapper.get({item: new Subscription(purchaseToken)} ).then(
        s => s.item
    )
}

function updateSub(subscriptionUpdate: SubscriptionUpdate): Promise<Subscription> {
    const subscription = makeSubscription(subscriptionUpdate);
    return dynamoMapper.update({item: subscription}).then(result => result.item)

}

function putSubscription(subscriptionUpdate: SubscriptionUpdate): Promise<Subscription>  {
    const subscription = makeSubscription(subscriptionUpdate);
    return dynamoMapper.put({item: subscription}).then(result => result.item)
}



export async function parseAndStoreSubscriptionUpdate (
    sqsRecord: SQSRecord,
    fetchSubscriberDetails: (record: SQSRecord) => Promise<SubscriptionUpdate>
) {
   fetchSubscriberDetails(sqsRecord)
       .then(payload => {
           console.log("++ Get sup")
           getSubscription(payload.purchaseToken)
           .then( subscriptionUpdate => {
               console.log("++ Ipdate sup")
              updateSub(payload)
            })
            .catch(err => {
                /*
                   see: https://github.com/awslabs/dynamodb-data-mapper-js
                   Need to catch for a non-existant object
                 */
                console.log("++ Create sup")

                putSubscription(payload)
            })
       } )
       .catch(
           error => console.log(`Error retrieving payload from google: ${error}`)

       )

}