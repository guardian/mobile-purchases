import {SQSEvent, SQSRecord} from 'aws-lambda'
import {SubscriptionUpdate} from "./updatesub";
import {AppleSubscription} from "../models/subscription";


/*
export function makeDynamoPromis(record: SQSRecord): Promise<AppleSubscription>  {
    

}

*/
export function handler(event: SQSEvent) {
    console.log(`Event: ${JSON.stringify(event)}`)
}