import {SQSEvent, SQSRecord} from 'aws-lambda'
import {makeCancellationTime, makeTimeToLive, SubscriptionUpdate} from "./updatesub";
import {AppleSubscription} from "../models/subscription";
import {parseAndStoreSubscriptionUpdate} from './updatesub'



interface AppleSubUpdate {
    receipt: string,
    transactionId: string,
    startDate: string,
    cancellationDate: string,
    endDate: string,
    autoRenewing: boolean
    appleBody: string
}

export function makeDynamoPromise(record: SQSRecord): Promise<AppleSubscription>  {
    const sub = JSON.parse(record.body) as AppleSubUpdate
    console.log(`+++++++++++ Sub: ${JSON.stringify(sub)}`)
    const appleSubscription = new AppleSubscription(
        sub.transactionId,
        sub.receipt,
        new Date(Number.parseInt(sub.startDate)).toISOString(),
        new Date(Number.parseInt(sub.endDate)).toISOString(),
        makeCancellationTime(sub.cancellationDate),
        sub.autoRenewing,
        sub.appleBody,
        makeTimeToLive(new Date(Date.now()))
    );
    console.log(`+++++++++++ Apple: ${JSON.stringify(appleSubscription)}`)
    return Promise.resolve( appleSubscription)
}

export async function handler(event: SQSEvent) {
    const emptyPromises = event.Records.map( async (record) => {
        await parseAndStoreSubscriptionUpdate(record, makeDynamoPromise)
    })

    return Promise.all(emptyPromises)
        .then( value => {
            console.log(`Processed ${event.Records.length} subscriptions`)
            "OL"
        })
        .catch(error => {
            console.error("Error processing subsctption update: ", error)
            return "Error"
        })


}