import 'source-map-support/register'
import {dynamoMapper, s3} from "../utils/aws";
import {ReadSubscription} from "../models/subscription";
import {ReadUserSubscription} from "../models/userSubscription";
import zlib from 'zlib'
import {Stage} from "../utils/appIdentity";
import {DynamoStream} from "./dynamoStream";
import {plusDays} from "../utils/dates";

export async function handler(): Promise<any> {
    const bucket = process.env['ExportBucket'];
    if (!bucket) throw new Error('Variable ExportBucket must be set');

    const className = process.env['ClassName'];
    let stream = null;
    switch (className) {
        case "ReadSubscription":
            console.log("Reading subscription from subscriptions");
            stream = new DynamoStream(dynamoMapper.scan(ReadSubscription));
            break;
        case "ReadUserSubscription":
            console.log("Reading user subscription from user subscription");
            stream = new DynamoStream(dynamoMapper.scan(ReadUserSubscription));
            break;
        default:
            throw new Error(`Invalid ClassName value ${className}`);
    }

    let zippedStream = zlib.createGzip();
    stream.pipe(zippedStream);

    const yesterday = plusDays(new Date(), -1).toISOString().substr(0,10);
    const prefix = (Stage === "PROD") ? "data" : "code-data";
    const filename = `${prefix}/date=${yesterday}/${yesterday}.json.gz`;
    console.log(`uploading ${filename} to s3`);
    const managedUpload = s3.upload({
        Bucket: bucket,
        Key: filename,
        Body: zippedStream,
        ACL: "bucket-owner-full-control"
    });

    await managedUpload.promise();

    console.log(`Export succeeded, read ${stream.recordCount()} records`);

    return {recordCount: stream.recordCount()};
}
