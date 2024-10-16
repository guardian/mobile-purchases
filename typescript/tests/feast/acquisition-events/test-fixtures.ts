import { FeastSQSEvent, FeastSQSRecord } from '../../../src/feast/acquisition-events/models';
import {ReadSubscription} from "../../../src/models/subscription";
import {Platform} from "../../../src/models/platform";

export const appleSubscriptionId = 'fakeAppleFeastSubscriptionId';
export const googleSubscriptionId = 'fakeGoogleFeastSubscriptionId';

const appleReadSubscription = new ReadSubscription();
appleReadSubscription.setSubscriptionId(appleSubscriptionId);
appleReadSubscription.platform = Platform.IosFeast;

const googleReadSubscription = new ReadSubscription();
googleReadSubscription.setSubscriptionId(googleSubscriptionId);
googleReadSubscription.platform = Platform.AndroidFeast;

export const appleFeastRecord: FeastSQSRecord = {
    "messageId": "48501d06-2c1d-4e06-80b9-7617cd9df313",
    "receiptHandle": "Hi there",
    "body": appleReadSubscription,
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
    "body": googleReadSubscription,
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

