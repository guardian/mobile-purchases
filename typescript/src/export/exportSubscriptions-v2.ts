import 'source-map-support/register';
import { aws } from '../utils/aws';
import { plusDays } from '../utils/dates';

function prefix_creator(stage: string): string {
    const yesterday = plusDays(new Date(), -1).toISOString().substr(0, 10);
    if (stage == 'CODE') {
        return `v2/code-data/date=${yesterday}`;
    } else {
        return `v2/data/date=${yesterday}`;
    }
}

export async function handler(): Promise<string> {
    const bucket = process.env['ExportBucket'];
    const s3BucketOwner = process.env['BucketOwner'];
    const account = process.env['AccountId'];
    const app = process.env['App'];
    const stage = process.env['Stage'];
    const className = process.env['ClassName'];

    console.log(`[a057f375] bucket: ${bucket}`);
    console.log(`[f1bfbfdf] s3BucketOwner: ${s3BucketOwner}`);
    console.log(`[7b78c711] app: ${app}`);
    console.log(`[3e33ed60] stage: ${stage}`);
    console.log(`[7dfb97fc] className: ${className}`);

    if (!bucket) throw new Error('Variable ExportBucket must be set');
    if (!account) throw new Error('Variable AccountId must be set');
    if (!s3BucketOwner) throw new Error('Variable BucketOwner must be set');
    if (!app) throw new Error('Variable App must be set');
    if (!stage) throw new Error('Variable Stage must be set');
    if (!className) throw new Error('Variable ClassName must be set');

    let tableArn = null;
    switch (className) {
        case 'subscriptions':
            console.log('[0ef553b7] reading subscription from subscriptions');
            tableArn = `arn:aws:dynamodb:eu-west-1:${account}:table/${app}-${stage}-${className}`;
            break;
        case 'user-subscriptions':
            console.log('[88eff0ba] reading user subscription from user subscription');
            tableArn = `arn:aws:dynamodb:eu-west-1:${account}:table/${app}-${stage}-${className}`;
            break;
        default:
            throw new Error(`[7e03bfd5] invalid ClassName value ${className}`);
    }

    if (!tableArn) throw new Error('[1c94600f] variable TableArn must be set');

    const params = {
        TableArn: tableArn,
        S3Bucket: bucket,
        S3BucketOwner: s3BucketOwner,
        S3Prefix: prefix_creator(stage),
        ExportFormat: 'DYNAMODB_JSON',
    };

    return aws
        .exportTableToPointInTime(params)
        .promise()
        .then((result) => {
            console.log(`[89ba1cd3] exporting subscription data to ${bucket}`);
            return `[0d1f18ab] dynamo export started, with status: ${result.ExportDescription?.ExportStatus}`;
        })
        .catch((err) => {
            throw new Error('[4f4acf88] Failed to start dynamo export');
        });
}
