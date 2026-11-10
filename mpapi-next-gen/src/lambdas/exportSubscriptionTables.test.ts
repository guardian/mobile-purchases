import { Upload } from '@aws-sdk/lib-storage';
import zlib from 'zlib';
import { Readable } from 'stream';
import {
	handler,
	DynamoStream,
	computePrefix,
} from './exportSubscriptionTables';
import { subscriptionsFullTableName } from '../common/subscription';
import { userSubscriptionsFullTableName } from '../common/userSubscription';

const globalRecordedCalls: any[] = [];
const globalResponseQueue: any[] = [];

jest.mock('@aws-sdk/client-dynamodb', () => {
	const actual = jest.requireActual('@aws-sdk/client-dynamodb');
	return {
		...actual,
		DynamoDBClient: jest.fn().mockImplementation(() => ({
			send: jest.fn().mockImplementation((command: any) => {
				if (command && typeof command === 'object' && 'input' in command) {
					globalRecordedCalls.push(command.input);
					const next = globalResponseQueue.shift();
					if (next instanceof Error) {
						return Promise.reject(next);
					}
					return Promise.resolve(
						next || { Items: [], LastEvaluatedKey: undefined },
					);
				}
				return Promise.resolve({});
			}),
		})),
	};
});

jest.mock('../common/subscription', () => ({
	subscriptionsFullTableName: jest.fn(
		() => 'mobile-purchases-CODE-subscriptions',
	),
}));

jest.mock('../common/userSubscription', () => ({
	userSubscriptionsFullTableName: jest.fn(
		() => 'mobile-purchases-CODE-user-subscriptions',
	),
}));

let caughtUploadParams: any = undefined;
let caughtUploadBytes: Buffer = Buffer.alloc(0);
let uploadConstructorCount = 0;

jest.mock('@aws-sdk/lib-storage', () => {
	return {
		Upload: jest.fn().mockImplementation(function (this: any, init: any) {
			uploadConstructorCount += 1;
			this.params = init.params;
			this.client = init.client;
			caughtUploadParams = init.params;
			this.done = jest.fn(
				() =>
					new Promise<void>((resolve, reject) => {
						const body = init.params.Body;
						if (!body || typeof body.on !== 'function') {
							resolve();
							return;
						}
						const chunks: Buffer[] = [];
						body.on('data', (chunk: Buffer) => chunks.push(chunk));
						body.on('end', () => {
							caughtUploadBytes = Buffer.concat(chunks);
							resolve();
						});
						body.on('error', reject);
					}),
			);
		}),
	};
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _consoleErrorSpy = jest
	.spyOn(console, 'error')
	.mockImplementation(() => {});

describe('Streaming DynamoDB Export to S3 Service', () => {
	const subscriptionsFullTableNameMock =
		subscriptionsFullTableName as jest.Mock;
	const userSubscriptionsFullTableNameMock =
		userSubscriptionsFullTableName as jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		uploadConstructorCount = 0;
		subscriptionsFullTableNameMock.mockReturnValue(
			'mobile-purchases-CODE-subscriptions',
		);
		userSubscriptionsFullTableNameMock.mockReturnValue(
			'mobile-purchases-CODE-user-subscriptions',
		);
		globalRecordedCalls.length = 0;
		globalResponseQueue.length = 0;
		caughtUploadParams = undefined;
		caughtUploadBytes = Buffer.alloc(0);
		delete process.env.ExportBucket;
		delete process.env.ClassName;
	});

	describe('DynamoStream Pagination and Buffering Backpressure', () => {
		it('should evaluate multiple Scan pages matching pagination tokens sequentially', (done) => {
			globalResponseQueue.push(
				{
					Items: [{ id: { S: 'sub-1' } }],
					LastEvaluatedKey: { id: { S: 'sub-1' } },
				},
				{
					Items: [{ id: { S: 'sub-2' } }],
					LastEvaluatedKey: undefined,
				},
			);

			const stream = new DynamoStream('mock-table');
			const receivedChunks: string[] = [];

			stream.on('data', (chunk: Buffer) => {
				receivedChunks.push(chunk.toString());
			});

			stream.on('error', done);

			stream.on('end', () => {
				expect(receivedChunks).toEqual([
					'{"id":"sub-1"}\n',
					'{"id":"sub-2"}\n',
				]);
				expect(stream.recordCount()).toBe(2);
				expect(globalRecordedCalls).toHaveLength(2);
				expect(globalRecordedCalls[0].TableName).toBe('mock-table');
				expect(globalRecordedCalls[1].TableName).toBe('mock-table');
				expect(globalRecordedCalls[0].Limit).toBe(100);
				expect(globalRecordedCalls[1].Limit).toBe(100);
				expect(globalRecordedCalls[0].ExclusiveStartKey).toBeUndefined();
				expect(globalRecordedCalls[1].ExclusiveStartKey).toEqual({
					id: { S: 'sub-1' },
				});

				stream.destroy();
				done();
			});
		});

		it('should not issue a second Scan when the first page returns no LastEvaluatedKey', (done) => {
			globalResponseQueue.push({
				Items: [{ id: { S: 'only' } }],
				LastEvaluatedKey: undefined,
			});

			const stream = new DynamoStream('mock-table');
			const receivedChunks: string[] = [];

			stream.on('data', (chunk: Buffer) =>
				receivedChunks.push(chunk.toString()),
			);
			stream.on('error', done);
			stream.on('end', () => {
				expect(receivedChunks).toEqual(['{"id":"only"}\n']);
				expect(globalRecordedCalls).toHaveLength(1);
				expect(stream.recordCount()).toBe(1);
				stream.destroy();
				done();
			});
		});

		it('should return zero records when the table is empty', (done) => {
			globalResponseQueue.push({ Items: [], LastEvaluatedKey: undefined });

			const stream = new DynamoStream('mock-table');
			const receivedChunks: string[] = [];

			stream.on('data', (chunk: Buffer) =>
				receivedChunks.push(chunk.toString()),
			);
			stream.on('error', done);
			stream.on('end', () => {
				expect(receivedChunks).toEqual([]);
				expect(globalRecordedCalls).toHaveLength(1);
				expect(stream.recordCount()).toBe(0);
				stream.destroy();
				done();
			});
		});

		it('should respect backpressure when the consumer reads slowly', (done) => {
			const items = Array.from({ length: 200 }, (_, i) => ({
				id: { S: `sub-${i}` },
			}));
			globalResponseQueue.push({ Items: items, LastEvaluatedKey: undefined });

			const stream = new DynamoStream('mock-table', { highWaterMark: 16 });
			const pushSpy = jest.spyOn(stream as any, 'push');
			const received: string[] = [];

			stream.on('data', (chunk: Buffer) => received.push(chunk.toString()));
			stream.on('error', done);
			stream.on('end', () => {
				expect(received).toHaveLength(200);
				expect(stream.recordCount()).toBe(200);
				expect(pushSpy.mock.results.some((r) => r.value === false)).toBe(true);
				stream.destroy();
				done();
			});
		});

		it('should emit an error when the Scan command rejects', (done) => {
			globalResponseQueue.push(new Error('scan boom'));

			const stream = new DynamoStream('mock-table');
			stream.on('data', () => {});
			stream.on('error', (err) => {
				expect((err as Error).message).toBe('scan boom');
				expect(globalRecordedCalls).toHaveLength(1);
				stream.destroy();
				done();
			});
		});
	});

	describe('Handler Table Routing & Selection Logic', () => {
		it('should accurately query subscriptions table when ClassName matches Subscription', async () => {
			process.env.ExportBucket = 'mock-export-bucket';
			process.env.ClassName = 'Subscription';
			globalResponseQueue.push({ Items: [], LastEvaluatedKey: undefined });

			await handler();

			expect(globalRecordedCalls).toHaveLength(1);
			expect(globalRecordedCalls[0].TableName).toBe(
				'mobile-purchases-CODE-subscriptions',
			);
			expect(subscriptionsFullTableNameMock).toHaveBeenCalledTimes(1);
			expect(userSubscriptionsFullTableNameMock).not.toHaveBeenCalled();
		});

		it('should accurately query user-subscriptions table when ClassName matches UserSubscription', async () => {
			process.env.ExportBucket = 'mock-export-bucket';
			process.env.ClassName = 'UserSubscription';
			globalResponseQueue.push({ Items: [], LastEvaluatedKey: undefined });

			await handler();

			expect(globalRecordedCalls).toHaveLength(1);
			expect(globalRecordedCalls[0].TableName).toBe(
				'mobile-purchases-CODE-user-subscriptions',
			);
			expect(userSubscriptionsFullTableNameMock).toHaveBeenCalledTimes(1);
			expect(subscriptionsFullTableNameMock).not.toHaveBeenCalled();
		});
	});

	describe('Zipped Newline-Delimited Multitransmit Data Assertions', () => {
		it('should stream completely decompressed newline-delimited outputs into the storage instance parameter config', async () => {
			process.env.ExportBucket = 'mock-export-bucket';
			process.env.ClassName = 'Subscription';

			globalResponseQueue.push({
				Items: [
					{ subscriptionId: { S: 'sub-a' }, active: { BOOL: true } },
					{ subscriptionId: { S: 'sub-b' }, active: { BOOL: false } },
				],
				LastEvaluatedKey: undefined,
			});

			await handler();

			expect(Upload).toHaveBeenCalledTimes(1);
			expect(uploadConstructorCount).toBe(1);
			expect(caughtUploadParams.Bucket).toBe('mock-export-bucket');
			expect(caughtUploadParams.ACL).toBe('bucket-owner-full-control');
			expect(caughtUploadParams.Key).toMatch(
				/^code-data\/date=\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\.json\.gz$/,
			);
			expect(caughtUploadParams.Body).toBeInstanceOf(Readable);

			const decompressedBuffer = await new Promise<Buffer>(
				(resolve, reject) => {
					zlib.gunzip(caughtUploadBytes, (err, buf) => {
						if (err) reject(err);
						else resolve(buf);
					});
				},
			);

			const stringOutput = decompressedBuffer.toString('utf8');
			expect(stringOutput).toBe(
				'{"subscriptionId":"sub-a","active":true}\n' +
					'{"subscriptionId":"sub-b","active":false}\n',
			);
		});

		it('should produce gzip-magic-prefixed bytes for the upload body', async () => {
			process.env.ExportBucket = 'mock-export-bucket';
			process.env.ClassName = 'Subscription';

			globalResponseQueue.push({
				Items: [{ id: { S: 'one' } }],
				LastEvaluatedKey: undefined,
			});

			await handler();

			expect(caughtUploadBytes.length).toBeGreaterThan(0);
			expect(caughtUploadBytes[0]).toBe(0x1f);
			expect(caughtUploadBytes[1]).toBe(0x8b);
		});
	});

	describe('Export Prefix Selection', () => {
		it('should return the prod data prefix when stage is PROD', () => {
			expect(computePrefix('PROD')).toBe('data');
		});

		it('should return the code-data prefix for non-prod stages', () => {
			expect(computePrefix('CODE')).toBe('code-data');
			expect(computePrefix('TEST')).toBe('code-data');
			expect(computePrefix('')).toBe('code-data');
		});
	});

	describe('Exception Bounds Safety Guards', () => {
		it('should raise an error sequence immediately when process context definitions map out a missing bucket', async () => {
			process.env.ClassName = 'Subscription';

			await expect(handler()).rejects.toThrow(
				'Variable ExportBucket must be set',
			);
			expect(globalRecordedCalls).toHaveLength(0);
			expect(Upload).not.toHaveBeenCalled();
		});

		it('should raise an error sequence immediately when process context definitions map out an invalid ClassName', async () => {
			process.env.ExportBucket = 'mock-export-bucket';
			process.env.ClassName = 'InvalidModelStructure';

			await expect(handler()).rejects.toThrow(
				'Invalid ClassName value InvalidModelStructure',
			);
			expect(globalRecordedCalls).toHaveLength(0);
			expect(Upload).not.toHaveBeenCalled();
		});
	});
});
