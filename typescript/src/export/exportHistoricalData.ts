import 'source-map-support/register'
import {s3, sqs} from "../utils/aws";
import zlib from 'zlib'
import {Stage} from "../utils/appIdentity";
import {plusDays} from "../utils/dates";
import {Message, ReceiveMessageRequest} from "aws-sdk/clients/sqs";

async function recursivelyFetchSqsMessages(sqsUrl: string, handleMsg: (message: Message) => void): Promise<void> {
    const request: ReceiveMessageRequest = {
        QueueUrl: sqsUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 3,
        VisibilityTimeout: 600
    };
    const sqsResp = await sqs.receiveMessage(request).promise();
    if (sqsResp.Messages && sqsResp.Messages.length > 0) {
        sqsResp.Messages.forEach(handleMsg);
        return await recursivelyFetchSqsMessages(sqsUrl, handleMsg)
    }
}

function group<A>(arrayToGroup: A[], groupSize: number): A[][] {
    if (arrayToGroup.length > 10) {
        const copiedArray = arrayToGroup.slice(0);
        const firstGroup = copiedArray.splice(0, groupSize);
        return [firstGroup].concat(group(copiedArray, groupSize));
    } else {
        return [arrayToGroup.slice(0)];
    }
}

async function deleteAllSqsMessages(sqsUrl: string, receiptHandleToDelete: string[]): Promise<void> {
    if (receiptHandleToDelete.length > 0) {
        const batches = group(receiptHandleToDelete, 10);

        const deletions = batches.map(batch => {
            const entries = batch.map((receiptHandle, index) => {
                return {Id: (index + 1).toString(), ReceiptHandle: receiptHandle};
            });
            return sqs.deleteMessageBatch({QueueUrl: sqsUrl, Entries: entries}).promise();
        });

        await Promise.all(deletions);
    }
}

export async function handler(params: {date: string}): Promise<any> {
    const bucket = process.env['ExportBucket'];
    if (!bucket) throw new Error('Variable ExportBucket must be set');

    const sqsUrl = process.env['SqsUrl'];
    if (!sqsUrl) throw new Error('Variable SqsUrl must be set');

    let zippedStream = zlib.createGzip();

    const yesterday = params.date ?? plusDays(new Date(), -1).toISOString().substr(0,10);
    const prefix = (Stage === "PROD") ? "data" : "code-data";
    const randomString = Math.random().toString(36).substring(10);
    const filename = `${prefix}/date=${yesterday}/${yesterday}-${randomString}.json.gz`;
    const managedUpload = s3.upload({
        Bucket: bucket,
        Key: filename,
        Body: zippedStream,
        ACL: "bucket-owner-full-control"
    });

    const msgToDelete: string[] = [];
    let totalMsgCount = 0;
    let processedMsgCount = 0;

    function handleOneMessage(sqsMessage: Message): void {
        totalMsgCount++;
        const parsedMessage = JSON.parse(sqsMessage.Body ?? "");
        const messageDate = parsedMessage.snapshotDate.substr(0, 10);
        if (messageDate == yesterday) {
            processedMsgCount++;
            const message = JSON.stringify(parsedMessage) + '\n';
            zippedStream.write(message);
            if (sqsMessage.ReceiptHandle) msgToDelete.push(sqsMessage.ReceiptHandle);
        }
    }

    await recursivelyFetchSqsMessages(sqsUrl, handleOneMessage);

    zippedStream.end();
    await managedUpload.promise();

    console.log(`Export succeeded, read ${totalMsgCount} records, processed ${processedMsgCount}`);

    await deleteAllSqsMessages(sqsUrl, msgToDelete);
    console.log(`Deleted ${msgToDelete.length} messages from the SQS queue`);

    return {recordCount: totalMsgCount};
}