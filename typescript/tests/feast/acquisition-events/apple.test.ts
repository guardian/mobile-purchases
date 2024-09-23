import {SQSEvent, SQSRecord} from "aws-lambda";
import {handler} from "../../../src/feast/acquisition-events/apple";

const sQSRecord: SQSRecord = {
        "messageId": "48501d06-2c1d-4e06-80b9-7617cd9df313",
        "receiptHandle": "Hi there",
        "body": "This is a message from the feast apple acquisition events queue",
        "attributes":
        {
            "ApproximateReceiveCount": "1",
            "AWSTraceHeader": "Root=1-66c35630-058f68030b77da7b36b3a909",
            "SentTimestamp": "1724077616681",
            "SenderId": "AROA4TAR37NZM4NZVE3D6BackplaneAssumeRoleSession",
            "ApproximateFirstReceiveTimestamp": "1724077616692"
        },
        "messageAttributes":
        {
            "tickettailor-webhook-signature":
            {
                "stringValue": "t=1724160026,v1=a3dbd8cfb0f04a0a9b0dd9d2547f1dd1a51e60d528a4edaee3bc02085517bd50",
                "stringListValues":
                [],
                "binaryListValues":
                [],
                "dataType": "String"
            }
        },
        "md5OfBody": "f76fca7a395b41f1dd0d9af3b1755ac1",
        "eventSource": "aws:sqs",
        "eventSourceARN": "arn:aws:sqs:eu-west-1:865473395570:ticket-tailor-webhook-queue-CODE",
        "awsRegion": "eu-west-1"
    };

const sQSEvent: SQSEvent = {
    Records: [ sQSRecord ],
}

describe("The Feast Apple Acquisition Event", () => {
    it("Should return the appropriate message", async () => {
        const result = await handler(sQSEvent);

        expect(result).toStrictEqual("Feast Apple Acquisition Events Lambda has been called");
    });
});