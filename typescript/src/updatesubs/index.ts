import Sqs from 'aws-sdk/clients/sqs';
import {SQSEvent, SQSRecord} from 'aws-lambda'

export async function handler(event: SQSEvent) {

    for(let record in event.Records) {

        const body  = record.body;
        console.log(body);
    }
}