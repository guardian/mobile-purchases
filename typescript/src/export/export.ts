import 'source-map-support/register'
import {dynamoMapper, s3} from "../utils/aws";
import {ReadSubscription} from "../models/subscription";
import {Readable, ReadableOptions} from "stream";
import {ScanIterator} from "@aws/dynamodb-data-mapper";
import {ZeroArgumentsConstructor} from "@aws/dynamodb-data-marshaller";
import {ReadUserSubscription} from "../models/userSubscription";
import zlib from 'zlib'
import {Stage} from "../utils/appIdentity";


class DynamoStream<T> extends Readable {

    iterator: ScanIterator<T>;

    constructor(valueConstructor: ZeroArgumentsConstructor<T>, opts?: ReadableOptions) {
        super(opts);
        this.iterator = dynamoMapper.scan(valueConstructor);
    }

    readNext() {
        this.iterator.next().then(iteratorResult => {
            if (!iteratorResult.done) {
                const pushResult = this.push(JSON.stringify(iteratorResult.value) + '\n');
                if (pushResult) {
                    this.readNext()
                }
            } else {
                this.push(null);
            }
        });
    }

    _read(size: number): void {
        this.readNext()
    }

    recordCount(): number {
        return this.iterator.scannedCount;
    }

}

export async function handler(): Promise<any> {
    const bucket = process.env['ExportBucket'];
    if (!bucket) throw new Error('Variable ExportBucket must be set');

    const className = process.env['ClassName'];
    let stream = null;
    switch (className) {
        case "ReadSubscription":
            stream = new DynamoStream(ReadSubscription);
            break;
        case "ReadUserSubscription":
            stream = new DynamoStream(ReadUserSubscription);
            break;
        default:
            throw new Error(`Invalid ClassName value ${className}`);
    }

    let zippedStream = zlib.createGzip();
    stream.pipe(zippedStream);

    const today = (new Date()).toISOString().substr(0,10);
    const prefix = (Stage === "PROD") ? "data" : "code-data";
    const filename = `${prefix}/date=${today}/${today}.json.gz`;
    let managedUpload = s3.upload({Bucket: bucket, Key: filename, Body: zippedStream});

    await managedUpload.promise();

    console.log(`Export succeeded, read ${stream.recordCount()} records`);

    return {recordCount: stream.recordCount()};
}