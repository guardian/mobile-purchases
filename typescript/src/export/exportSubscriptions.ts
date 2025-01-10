import 'source-map-support/register';
import zlib from 'zlib';
import { SubscriptionEmpty } from '../models/subscription';
import { UserSubscriptionEmpty } from '../models/userSubscription';
import { Stage } from '../utils/appIdentity';
import { dynamoMapper, s3 } from '../utils/aws';
import { plusDays } from '../utils/dates';
import { DynamoStream } from './dynamoStream';

export async function handler(): Promise<any> {
  const bucket = process.env['ExportBucket'];
  if (!bucket) throw new Error('Variable ExportBucket must be set');

  const className = process.env['ClassName'];
  let stream = null;
  switch (className) {
    case 'Subscription':
      console.log('Reading subscription from subscriptions');
      stream = new DynamoStream(dynamoMapper.scan(SubscriptionEmpty));
      break;
    case 'UserSubscription':
      console.log('Reading user subscription from user subscription');
      stream = new DynamoStream(dynamoMapper.scan(UserSubscriptionEmpty));
      break;
    default:
      throw new Error(`Invalid ClassName value ${className}`);
  }

  const zippedStream = zlib.createGzip();
  stream.pipe(zippedStream);

  const yesterday = plusDays(new Date(), -1).toISOString().substr(0, 10);
  const prefix = Stage === 'PROD' ? 'data' : 'code-data';
  const filename = `${prefix}/date=${yesterday}/${yesterday}.json.gz`;
  console.log(`uploading ${filename} to s3`);
  const managedUpload = s3.upload({
    Bucket: bucket,
    Key: filename,
    Body: zippedStream,
    ACL: 'bucket-owner-full-control',
  });

  await managedUpload.promise();

  console.log(`Export succeeded, read ${stream.recordCount()} records`);

  return { recordCount: stream.recordCount() };
}
