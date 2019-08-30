import 'source-map-support/register'
import {dynamoMapper, s3} from "../utils/aws";
import zlib from 'zlib'
import {Stage} from "../utils/appIdentity";
import {DynamoStream} from "./dynamoStream";
import {ReadSubscriptionEvent, SubscriptionEvent} from "../models/subscriptionEvent";
import {plusDays} from "../utils/dates";

function cleanupEvent(subEvent: SubscriptionEvent): any {
    if (subEvent.applePayload) {
        delete subEvent.applePayload.password; // just to be safe
        delete subEvent.applePayload.latest_receipt; // really no need to put that in the datalake
    }
    return subEvent;
}

export async function handler(): Promise<any> {
    const bucket = process.env['ExportBucket'];
    if (!bucket) throw new Error('Variable ExportBucket must be set');

    const yesterday = plusDays(new Date(), -1).toISOString().substr(0,10);

    const iterator = dynamoMapper.query(ReadSubscriptionEvent,{date: yesterday}, {indexName: "date-timestamp-index-v2"});
    const stream = new DynamoStream(iterator, cleanupEvent);

    let zippedStream = zlib.createGzip();
    stream.pipe(zippedStream);

    const prefix = (Stage === "PROD") ? "data" : "code-data";
    const filename = `${prefix}/date=${yesterday}/${yesterday}.json.gz`;
    let managedUpload = s3.upload({
        Bucket: bucket,
        Key: filename,
        Body: zippedStream,
        ACL: "bucket-owner-full-control"
    });

    await managedUpload.promise();

    console.log(`Export succeeded, read ${stream.recordCount()} records`);

    return {recordCount: stream.recordCount()};
}