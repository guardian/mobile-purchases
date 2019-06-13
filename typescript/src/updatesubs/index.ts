import Sqs from 'aws-sdk/clients/sqs';
import {SQSEvent, SQSRecord} from 'aws-lambda'

export async function handler(event: SQSEvent) {

    event.Records.forEach( (rec) => {
        console.log("Body: " + rec.body)
    })
}