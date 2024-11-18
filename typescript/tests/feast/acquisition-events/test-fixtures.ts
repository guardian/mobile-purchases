import type { SQSEvent, SQSRecord } from 'aws-lambda';
import { SubscriptionEmpty } from "../../../src/models/subscription";
import {Platform} from "../../../src/models/platform";

export const appleFeastRecord: SQSRecord = {
    "messageId": "48501d06-2c1d-4e06-80b9-7617cd9df313",
    "receiptHandle": "Hi there",
    "body": "subscription",
    "attributes":
        {
            "ApproximateReceiveCount": "1",
            "AWSTraceHeader": "foo",
            "SentTimestamp": "1724077616681",
            "SenderId": "Bar",
            "ApproximateFirstReceiveTimestamp": "1724077616692"
        },
    "messageAttributes": {},
    "md5OfBody": "foo",
    "eventSource": "aws:sqs",
    "eventSourceARN": "foo",
    "awsRegion": "eu-west-1"
};

export const appleSQSRecord: SQSEvent = {
    "Records": new Array<SQSRecord>(appleFeastRecord),
};

export const googleFeastRecord: SQSRecord = {
    "messageId": "48501d06-2c1d-4e06-80b9-7617cd9df313",
    "receiptHandle": "Hi there",
    "body": "subscription",
    "attributes":
        {
            "ApproximateReceiveCount": "1",
            "AWSTraceHeader": "foo",
            "SentTimestamp": "1724077616681",
            "SenderId": "Bar",
            "ApproximateFirstReceiveTimestamp": "1724077616692"
        },
    "messageAttributes": {},
    "md5OfBody": "foo",
    "eventSource": "aws:sqs",
    "eventSourceARN": "foo",
    "awsRegion": "eu-west-1"
};

export const googleSQSRecord: SQSEvent = {
    "Records": new Array<SQSRecord>(googleFeastRecord),
};

