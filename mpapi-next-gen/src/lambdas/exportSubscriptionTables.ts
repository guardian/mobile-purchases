import 'source-map-support/register';
import zlib from 'zlib';
import { subscriptionsFullTableName } from '../common/subscription';
import { userSubscriptionsFullTableName } from '../common/userSubscription';
import { Stage } from '../common/appIdentity';
import { plusDays } from '../common/dates';
import type { ReadableOptions } from 'stream';
import { Readable } from 'stream';
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Region } from '../common/appIdentity';

// -----------------------------------------------------------------------------
// Types

export class DynamoStream extends Readable {
	private tableName: string;
	private lastEvaluatedKey: Record<string, any> | undefined = undefined;
	private itemBuffer: any[] = [];
	private isDone = false;
	private totalScannedCount = 0;

	constructor(tableName: string, opts?: ReadableOptions) {
		super(opts);
		this.tableName = tableName;
	}

	private async fetchNextBatch() {
		if (this.isDone) {
			this.push(null);
			return;
		}

		try {
			const response = await dynamoDbClient.send(
				new ScanCommand({
					TableName: this.tableName,
					ExclusiveStartKey: this.lastEvaluatedKey,
					Limit: 100, // Safe payload batch boundary
				}),
			);

			if (response.Items && response.Items.length > 0) {
				this.itemBuffer.push(...response.Items.map((item) => unmarshall(item)));
				this.totalScannedCount += response.Items.length;
			}

			this.lastEvaluatedKey = response.LastEvaluatedKey;
			if (!this.lastEvaluatedKey) {
				this.isDone = true;
			}

			this.streamBufferedItems();
		} catch (error) {
			console.error(
				`[6f40b2a1] Error scanning DynamoDB table ${this.tableName}:`,
				error,
			);
			this.emit('error', error);
		}
	}

	private streamBufferedItems() {
		let keepPushing = true;
		while (keepPushing && this.itemBuffer.length > 0) {
			const nextItem = this.itemBuffer.shift();
			keepPushing = this.push(JSON.stringify(nextItem) + '\n');
		}

		if (keepPushing) {
			if (this.isDone && this.itemBuffer.length === 0) {
				this.push(null);
			} else {
				this.fetchNextBatch();
			}
		}
	}

	_read(_size: number): void {
		if (this.itemBuffer.length > 0) {
			this.streamBufferedItems();
		} else {
			this.fetchNextBatch();
		}
	}

	recordCount(): number {
		return this.totalScannedCount;
	}
}

interface HandlerOutput {
	recordCount: number;
}

// -----------------------------------------------------------------------------
// Globals

const dynamoDbClient = new DynamoDBClient({ region: Region });
const s3Client = new S3Client({ region: Region });

// -----------------------------------------------------------------------------
// Functions

export function computePrefix(stage: string): string {
	return stage === 'PROD' ? 'data' : 'code-data';
}

// -----------------------------------------------------------------------------
// Handler

export async function handler(): Promise<HandlerOutput> {
	const bucket = process.env['ExportBucket'];
	console.log(`[cda81c34] bucket: ${bucket}`);
	if (!bucket) throw new Error('Variable ExportBucket must be set');

	const className = process.env['ClassName'];
	console.log(`[2f8bce68] className: ${className}`);

	let tableName = '';
	switch (className) {
		case 'Subscription':
			console.log('[9057c11] reading subscription from subscriptions');
			tableName = subscriptionsFullTableName();
			break;
		case 'UserSubscription':
			console.log(
				'[6b683c1a] reading user subscription from user subscription',
			);
			tableName = userSubscriptionsFullTableName();
			break;
		default:
			throw new Error(`Invalid ClassName value ${className}`);
	}

	const stream = new DynamoStream(tableName);
	const zippedStream = zlib.createGzip();
	stream.pipe(zippedStream);

	const yesterday = plusDays(new Date(), -1).toISOString().substring(0, 10);
	console.log(`[1f1fdd69] yesterday: ${yesterday}`);

	const prefix = computePrefix(Stage);
	const filename = `${prefix}/date=${yesterday}/${yesterday}.json.gz`;
	console.log(`[ead5f375] uploading ${filename} to s3`);

	// Use lib-storage upload wrapper to handle runtime streaming data blocks cleanly
	const managedUpload = new Upload({
		client: s3Client,
		params: {
			Bucket: bucket,
			Key: filename,
			Body: zippedStream,
			ACL: 'bucket-owner-full-control',
		},
	});

	await managedUpload.done();

	console.log(
		`[0cf35b42] export succeeded, read ${stream.recordCount()} records`,
	);

	return { recordCount: stream.recordCount() };
}
