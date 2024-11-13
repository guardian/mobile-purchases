import { FeastSQSEvent, FeastSQSRecord } from '../../../src/feast/acquisition-events/models';
import { SubscriptionEmpty } from "../../../src/models/subscription";
import {Platform} from "../../../src/models/platform";

export const appleSubscriptionId = 'fakeAppleFeastSubscriptionId';
export const googleSubscriptionId = 'fakeGoogleFeastSubscriptionId';

const appleSubscriptionEmpty = new SubscriptionEmpty();
appleSubscriptionEmpty.setSubscriptionId(appleSubscriptionId);
appleSubscriptionEmpty.platform = Platform.IosFeast;

const googleSubscriptionEmpty = new SubscriptionEmpty();
googleSubscriptionEmpty.setSubscriptionId(googleSubscriptionId);
googleSubscriptionEmpty.platform = Platform.AndroidFeast;

export const appleFeastRecord: FeastSQSRecord = {
    "messageId": "48501d06-2c1d-4e06-80b9-7617cd9df313",
    "receiptHandle": "Hi there",
    "body": appleSubscriptionEmpty,
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

export const appleSQSRecord: FeastSQSEvent = {
    "Records": new Array<FeastSQSRecord>(appleFeastRecord),
};

export const googleFeastRecord: FeastSQSRecord = {
    "messageId": "48501d06-2c1d-4e06-80b9-7617cd9df313",
    "receiptHandle": "Hi there",
    "body": googleSubscriptionEmpty,
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

export const googleSQSRecord: FeastSQSEvent = {
    "Records": new Array<FeastSQSRecord>(googleFeastRecord),
};

