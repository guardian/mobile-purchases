import {SQSEvent, SQSRecord} from 'aws-lambda'
import {makeCancellationTime, makeTimeToLive, parseAndStoreSubscriptionUpdate} from "./updatesub";
import {AppleSubscription} from "../models/subscription";


interface AppleSubUpdate {
    receipt: string,
    transactionId: string,
    startDate: string,
    cancellationDate: string,
    endDate: string,
    autoRenewing: boolean
    appleBody: string
}

export function sqsRecordToAppleSubscription(record: SQSRecord): Promise<AppleSubscription> {
    const sub = JSON.parse(record.body) as AppleSubUpdate;
    return Promise.resolve( new AppleSubscription(
        sub.transactionId,
        sub.receipt,
        new Date(Number.parseInt(sub.startDate)).toISOString(),
        new Date(Number.parseInt(sub.endDate)).toISOString(),
        makeCancellationTime(sub.cancellationDate),
        sub.autoRenewing,
        sub.appleBody,
        makeTimeToLive(new Date(Date.now()))
    ))
}

export async function handler(event: SQSEvent) {
    const emptyPromises = event.Records.map( async (record) => {
        return await parseAndStoreSubscriptionUpdate(record, sqsRecordToAppleSubscription)
    })

    return Promise.all(emptyPromises)
        .then( value => {
            console.log(`Processed ${event.Records.length} subscriptions`)
            "OK"
        })
        .catch(error => {
            console.error("Error processing subsctption update: ", error)
            return "Error"
        })


}