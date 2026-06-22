import 'source-map-support/register';
import zlib from 'zlib';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { SubscriptionEvent } from '../models/subscriptionEvent';
import { Stage } from '../utils/appIdentity';
import { plusDays } from '../utils/dates';
import { DynamoStream } from '../utils/dynamoStream';

const dynamoDBClient = new DynamoDBClient({ region: 'eu-west-1' });
const s3Client = new S3Client({ region: 'eu-west-1' });

function cleanupEvent(subEvent: SubscriptionEvent): SubscriptionEvent {
	const payload = subEvent.applePayload as
		| {
				password?: string;
				latest_receipt?: string;
				unified_receipt?: { latest_receipt?: string };
		  }
		| undefined;

	if (payload) {
		delete payload.password;
		delete payload.latest_receipt;
		if (payload.unified_receipt) {
			delete payload.unified_receipt.latest_receipt;
		}
	}
	return subEvent;
}

interface ManualBackfillEvent {
	date?: string;
}

interface HandlerOutput {
	recordCount: number;
}

export async function handler(
	event?: ManualBackfillEvent,
): Promise<HandlerOutput> {
	const bucket = process.env['ExportBucket'];
	console.log(`[ca76728f] starting export with bucket: ${bucket}`);

	if (!bucket) throw new Error('Variable ExportBucket must be set');

	const account = process.env['AccountId'];
	const app = process.env['App'];
	const stage = process.env['Stage'];
	const className = 'subscriptions';

	if (!account) throw new Error('Variable AccountId must be set');
	if (!app) throw new Error('Variable App must be set');
	if (!stage) throw new Error('Variable Stage must be set');

	const tableName = `${app}-${stage}-${className}`;
	console.log(`[table] using table: ${tableName}`);

	let yesterday = plusDays(new Date(), -1).toISOString().substring(0, 10);
	console.log(`[c882b045] yesterday: ${yesterday}`);

	if (event && event.date) {
		yesterday = event.date;
	}

	const stream = new DynamoStream<SubscriptionEvent>({
		client: dynamoDBClient,
		params: {
			TableName: tableName,
			FilterExpression: '#date = :date',
			ExpressionAttributeNames: {
				'#date': 'date',
			},
			ExpressionAttributeValues: {
				':date': { S: yesterday },
			},
		},
		transformItem: cleanupEvent,
		pageSize: 1000,
	});

	const zippedStream = zlib.createGzip();
	stream.pipe(zippedStream);

	const prefix = Stage === 'PROD' ? 'data' : 'code-data';
	const filename = `${prefix}/date=${yesterday}/${yesterday}.json.gz`;
	console.log(`[b6640f04] filename: ${filename}`);

	const uploadCommand = new PutObjectCommand({
		Bucket: bucket,
		Key: filename,
		Body: zippedStream,
		ACL: 'bucket-owner-full-control',
	});

	await s3Client.send(uploadCommand);

	console.log(
		`[5a02d341] export succeeded, read ${stream.recordCount()} records`,
	);

	return { recordCount: stream.recordCount() };
}
