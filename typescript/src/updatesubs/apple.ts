import {SQSEvent, SQSRecord} from 'aws-lambda'

export function handler(event: SQSEvent) {
    console.log(`Event: ${JSON.stringify(event)}`)
}