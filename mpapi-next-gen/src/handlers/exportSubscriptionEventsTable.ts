import 'source-map-support/register';
import zlib from 'zlib';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { QueryCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import type { SubscriptionEvent } from '../models/subscriptionEvent';
import { SubscriptionEventEmpty } from '../models/subscriptionEvent';
import { Stage } from '../utils/appIdentity';
import { plusDays } from '../utils/dates';

const dynamoClient = new DynamoDBClient({});
const s3Client = new S3Client({});

function cleanupEvent(subEvent: SubscriptionEvent): SubscriptionEvent {
	if (subEvent.applePayload) {
		const payload = subEvent.applePayload as Record<string, unknown>;
		delete payload.password;
		delete payload.latest_receipt;
		if (
			payload.unified_receipt &&
			typeof payload.unified_receipt === 'object'
		) {
			const unifiedReceipt = payload.unified_receipt as Record<string, unknown>;
			delete unifiedReceipt.latest_receipt;
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

async function* queryDynamoDBItems(
	tableName: string,
	date: string,
): AsyncGenerator<SubscriptionEvent> {
	let lastEvaluatedKey: Record<string, any> | undefined = undefined;
	let totalRecords = 0;

	do {
		const command: QueryCommand = new QueryCommand({
			TableName: tableName,
			IndexName: 'date-timestamp-index-v2',
			KeyConditionExpression: '#date = :date',
			ExpressionAttributeNames: {
				'#date': 'date',
			},
			ExpressionAttributeValues: {
				':date': { S: date },
			},
			ExclusiveStartKey: lastEvaluatedKey,
		});

		const response = await dynamoClient.send(command);

		if (response.Items) {
			for (const item of response.Items) {
				const unmarshalled = unmarshall(item) as SubscriptionEvent;
				yield cleanupEvent(unmarshalled);
				totalRecords++;
			}
		}

		lastEvaluatedKey = response.LastEvaluatedKey;
	} while (lastEvaluatedKey);

	console.log(`[dynamo-stream] read ${totalRecords} records`);
}

async function* createStreamFromGenerator(
	generator: AsyncGenerator<SubscriptionEvent>,
): AsyncGenerator<Buffer> {
	for await (const item of generator) {
		yield Buffer.from(JSON.stringify(item) + '\n', 'utf-8');
	}
}

async function streamToS3(
	generator: AsyncGenerator<Buffer>,
	bucket: string,
	key: string,
): Promise<number> {
	const chunks: Buffer[] = [];
	let recordCount = 0;

	for await (const chunk of generator) {
		chunks.push(chunk);
		recordCount++;
	}

	const data = Buffer.concat(chunks);
	const gzippedData = zlib.gzipSync(data);

	const command = new PutObjectCommand({
		Bucket: bucket,
		Key: key,
		Body: gzippedData,
		ACL: 'bucket-owner-full-control',
	});

	await s3Client.send(command);
	return recordCount;
}

export async function handler(
	event?: ManualBackfillEvent,
): Promise<HandlerOutput> {
	const bucket = process.env['ExportBucket'];
	console.log(`[ca76728f] starting export with bucket: ${bucket}`);

	if (!bucket) throw new Error('Variable ExportBucket must be set');

	let yesterday = plusDays(new Date(), -1).toISOString().substr(0, 10);
	console.log(`[c882b045] yesterday: ${yesterday}`);

	if (event && event.date) {
		yesterday = event.date;
	}

	const tableName = SubscriptionEventEmpty.getTableName();

	const itemGenerator = queryDynamoDBItems(tableName, yesterday);

	const streamGenerator = createStreamFromGenerator(itemGenerator);

	const prefix = Stage === 'PROD' ? 'data' : 'code-data';
	const filename = `${prefix}/date=${yesterday}/${yesterday}.json.gz`;
	console.log(`[b6640f04] filename: ${filename}`);

	const recordCount = await streamToS3(streamGenerator, bucket, filename);

	console.log(`[5a02d341] export succeeded, read ${recordCount} records`);

	return { recordCount };
}
