import 'source-map-support/register';
import zlib from 'zlib';
import { Upload } from '@aws-sdk/lib-storage';
import { SubscriptionEmpty } from '../models/subscription';
import { UserSubscriptionEmpty } from '../models/userSubscription';
import { Stage } from '../utils/appIdentity';
import { dynamoMapper, s3 } from '../utils/aws';
import { plusDays } from '../utils/dates';
import { DynamoStream } from './dynamoStream';

interface HandlerOutput {
	recordCount: number;
}

export async function handler(): Promise<HandlerOutput> {
	const bucket = process.env['ExportBucket'];
	console.log(`[cda81c34] bucket: ${bucket}`);
	if (!bucket) throw new Error('Variable ExportBucket must be set');

	const className = process.env['ClassName'];
	console.log(`[2f8bce68] className: ${className}`);

	let stream = null;
	switch (className) {
		case 'Subscription':
			console.log('[9057c11] reading subscription from subscriptions');
			stream = new DynamoStream(dynamoMapper.scan(SubscriptionEmpty));
			break;
		case 'UserSubscription':
			console.log(
				'[6b683c1a] reading user subscription from user subscription',
			);
			stream = new DynamoStream(dynamoMapper.scan(UserSubscriptionEmpty));
			break;
		default:
			throw new Error(`Invalid ClassName value ${className}`);
	}

	const zippedStream = zlib.createGzip();
	stream.pipe(zippedStream);

	const yesterday = plusDays(new Date(), -1).toISOString().substr(0, 10);
	console.log(`[1f1fdd69] yesterday: ${yesterday}`);

	const prefix = Stage === 'PROD' ? 'data' : 'code-data';
	const filename = `${prefix}/date=${yesterday}/${yesterday}.json.gz`;
	console.log(`[ead5f375] uploading ${filename} to s3`);

	const upload = new Upload({
		client: s3,
		params: {
			Bucket: bucket,
			Key: filename,
			Body: zippedStream,
			ACL: 'bucket-owner-full-control',
		},
	});

	await upload.done();

	console.log(
		`[0cf35b42] export succeeded, read ${stream.recordCount()} records`,
	);

	return { recordCount: stream.recordCount() };
}
