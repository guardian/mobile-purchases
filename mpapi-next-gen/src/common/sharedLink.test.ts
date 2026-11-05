// sharedLink.test.ts
import {
	enqueueUnstoredPurchaseTokenShared,
	persistUserSubscriptionLinksShared,
} from './sharedLink';
import type { SubscriptionCheckData } from './sharedLink';
import { UserSubscription } from '../common/userSubscription';
import { ProcessingError } from '../common/processingError';

jest.mock('@aws-sdk/client-dynamodb', () => ({
	DynamoDBClient: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => {
	const send = jest.fn();
	return {
		__esModule: true,
		__dynamoSend: send,
		DynamoDBDocumentClient: { from: jest.fn(() => ({ send })) },
		BatchGetCommand: jest.fn((input) => ({ __type: 'BatchGetCommand', input })),
		BatchWriteCommand: jest.fn((input) => ({
			__type: 'BatchWriteCommand',
			input,
		})),
	};
});

jest.mock('@aws-sdk/client-sqs', () => {
	const send = jest.fn();
	return {
		__esModule: true,
		__sqsSend: send,
		SQSClient: jest.fn().mockImplementation(() => ({ send })),
		SendMessageBatchCommand: jest.fn((input) => ({
			__type: 'SendMessageBatchCommand',
			input,
		})),
	};
});

jest.mock('../common/guIdentityApi', () => ({
	getAuthToken: jest.fn(),
	getUserId: jest.fn(),
}));

jest.mock('../common/subscription', () => ({
	subscriptionsFullTableName: () => 'subscriptions-table',
}));

jest.mock('../common/userSubscription', () => {
	const actual = jest.requireActual('../common/userSubscription');
	return {
		...actual,
		userSubscriptionsFullTableName: () => 'user-subscriptions-table',
	};
});

const dynamoSend: jest.Mock = jest.requireMock(
	'@aws-sdk/lib-dynamodb',
).__dynamoSend;
const sqsSend: jest.Mock = jest.requireMock('@aws-sdk/client-sqs').__sqsSend;

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

type TaggedCommand = { __type: string; input: any };

function allCommands(): TaggedCommand[] {
	return [
		...dynamoSend.mock.calls.map(([c]) => c as TaggedCommand),
		...sqsSend.mock.calls.map(([c]) => c as TaggedCommand),
	];
}

function commandsOfType(type: string): TaggedCommand[] {
	return allCommands().filter((c) => c.__type === type);
}

function makeUserSubs(count: number): UserSubscription[] {
	return Array.from(
		{ length: count },
		(_, i) => new UserSubscription('user-1', `tx-${i}`, '2024-01-01T00:00:00Z'),
	);
}

function makeChecks(count: number): SubscriptionCheckData[] {
	return Array.from({ length: count }, (_, i) => ({
		subscriptionId: `tx-${i}`,
		subscriptionReference: { receipt: `receipt-${i}` },
	}));
}

function mockDynamo(impl: (cmd: TaggedCommand) => any) {
	dynamoSend.mockImplementation((cmd) => Promise.resolve(impl(cmd)));
}

function mockSqs(impl: (cmd: TaggedCommand) => any) {
	sqsSend.mockImplementation((cmd) => Promise.resolve(impl(cmd)));
}

beforeEach(() => {
	dynamoSend.mockReset();
	sqsSend.mockReset();
});

describe('persistUserSubscriptionLinksShared', () => {
	it('returns 0 and calls nothing for empty input', async () => {
		const result = await persistUserSubscriptionLinksShared([]);
		expect(result).toBe(0);
		expect(dynamoSend).not.toHaveBeenCalled();
		expect(sqsSend).not.toHaveBeenCalled();
	});

	it('chunks at 25 and returns the input length', async () => {
		mockDynamo(() => ({}));

		const result = await persistUserSubscriptionLinksShared(makeUserSubs(60));

		expect(result).toBe(60);
		const writes = commandsOfType('BatchWriteCommand');
		expect(
			writes.map(
				(w) => w.input.RequestItems['user-subscriptions-table'].length,
			),
		).toEqual([25, 25, 10]);
	});

	it('writes PutRequest items with the expected shape', async () => {
		mockDynamo(() => ({}));

		await persistUserSubscriptionLinksShared([
			new UserSubscription('user-42', 'tx-abc', '2024-05-05T10:00:00Z'),
		]);

		const [write] = commandsOfType('BatchWriteCommand');
		expect(write.input.RequestItems['user-subscriptions-table']).toEqual([
			{
				PutRequest: {
					Item: {
						userId: 'user-42',
						subscriptionId: 'tx-abc',
						creationTimestamp: '2024-05-05T10:00:00Z',
					},
				},
			},
		]);
	});

	it('retries UnprocessedItems with only the remaining requests before moving to the next chunk', async () => {
		let call = 0;
		mockDynamo((cmd) => {
			call += 1;
			if (call === 1) {
				const chunk = cmd.input.RequestItems['user-subscriptions-table'];
				return {
					UnprocessedItems: { 'user-subscriptions-table': chunk.slice(0, 5) },
				};
			}
			return {};
		});

		const result = await persistUserSubscriptionLinksShared(makeUserSubs(30));
		expect(result).toBe(30);

		const writes = commandsOfType('BatchWriteCommand');
		expect(
			writes.map(
				(w) => w.input.RequestItems['user-subscriptions-table'].length,
			),
		).toEqual([25, 5, 5]);

		// Retry of chunk 1's unprocessed items comes immediately after chunk 1.
		const retriedIds = writes[1].input.RequestItems[
			'user-subscriptions-table'
		].map((r: any) => r.PutRequest.Item.subscriptionId);
		expect(retriedIds).toEqual(['tx-0', 'tx-1', 'tx-2', 'tx-3', 'tx-4']);

		// Chunk 2 is only attempted after chunk 1 has fully drained.
		const finalChunkIds = writes[2].input.RequestItems[
			'user-subscriptions-table'
		].map((r: any) => r.PutRequest.Item.subscriptionId);
		expect(finalChunkIds).toEqual([
			'tx-25',
			'tx-26',
			'tx-27',
			'tx-28',
			'tx-29',
		]);
	}, 10_000);

	it('rejects with a retryable ProcessingError when retries are exhausted', async () => {
		mockDynamo((cmd) => ({
			UnprocessedItems: {
				'user-subscriptions-table':
					cmd.input.RequestItems['user-subscriptions-table'],
			},
		}));

		const promise = persistUserSubscriptionLinksShared(makeUserSubs(1));
		await expect(promise).rejects.toBeInstanceOf(ProcessingError);
		await expect(promise).rejects.toMatchObject({ shouldRetry: true });
	}, 10_000);
});

describe('enqueueUnstoredPurchaseTokenShared', () => {
	const originalQueueUrl = process.env.QueueUrl;

	beforeEach(() => {
		process.env.QueueUrl = 'https://sqs.example/queue';
	});

	afterAll(() => {
		if (originalQueueUrl === undefined) delete process.env.QueueUrl;
		else process.env.QueueUrl = originalQueueUrl;
	});

	it('returns 0 and calls nothing for empty input', async () => {
		const result = await enqueueUnstoredPurchaseTokenShared([]);
		expect(result).toBe(0);
		expect(dynamoSend).not.toHaveBeenCalled();
		expect(sqsSend).not.toHaveBeenCalled();
	});

	it('chunks BatchGet at 100 keys', async () => {
		mockDynamo(() => ({ Responses: { 'subscriptions-table': [] } }));
		mockSqs((cmd) => ({ Successful: cmd.input.Entries }));

		await enqueueUnstoredPurchaseTokenShared(makeChecks(250));

		const gets = commandsOfType('BatchGetCommand');
		expect(
			gets.map((g) => g.input.RequestItems['subscriptions-table'].Keys.length),
		).toEqual([100, 100, 50]);
	});

	it('chunks SQS at 10 entries and enqueues only missing refs', async () => {
		mockDynamo((cmd) => {
			const keys = cmd.input.RequestItems['subscriptions-table'].Keys as Array<{
				subscriptionId: string;
			}>;
			const found = keys.filter((k) =>
				['tx-0', 'tx-100'].includes(k.subscriptionId),
			);
			return { Responses: { 'subscriptions-table': found } };
		});
		mockSqs((cmd) => ({ Successful: cmd.input.Entries }));

		const sent = await enqueueUnstoredPurchaseTokenShared(makeChecks(250));

		expect(sent).toBe(248);

		const sqsCalls = commandsOfType('SendMessageBatchCommand');
		expect(sqsCalls).toHaveLength(25);
		for (const call of sqsCalls) {
			expect(call.input.Entries.length).toBeLessThanOrEqual(10);
			expect(call.input.QueueUrl).toBe('https://sqs.example/queue');
		}

		const allBodies = sqsCalls.flatMap((c) =>
			c.input.Entries.map((e: any) => JSON.parse(e.MessageBody)),
		);
		expect(allBodies).not.toContainEqual({ receipt: 'receipt-0' });
		expect(allBodies).not.toContainEqual({ receipt: 'receipt-100' });
		expect(allBodies).toContainEqual({ receipt: 'receipt-1' });
	});

	it('retries UnprocessedKeys with only the unprocessed keys', async () => {
		let getCalls = 0;
		mockDynamo((cmd) => {
			getCalls += 1;
			const keys = cmd.input.RequestItems['subscriptions-table'].Keys as Array<{
				subscriptionId: string;
			}>;
			if (getCalls === 1) {
				return {
					Responses: { 'subscriptions-table': [{ subscriptionId: 'tx-0' }] },
					UnprocessedKeys: {
						'subscriptions-table': { Keys: keys.slice(1, 3) },
					},
				};
			}
			return { Responses: { 'subscriptions-table': [] } };
		});
		mockSqs((cmd) => ({ Successful: cmd.input.Entries }));

		const sent = await enqueueUnstoredPurchaseTokenShared(makeChecks(3));

		const gets = commandsOfType('BatchGetCommand');
		expect(gets).toHaveLength(2);
		expect(
			gets[1].input.RequestItems['subscriptions-table'].Keys.map(
				(k: any) => k.subscriptionId,
			),
		).toEqual(['tx-1', 'tx-2']);
		expect(sent).toBe(2);
	});

	it('rejects with a retryable ProcessingError when get retries are exhausted', async () => {
		mockDynamo((cmd) => ({
			Responses: { 'subscriptions-table': [] },
			UnprocessedKeys: {
				'subscriptions-table': {
					Keys: cmd.input.RequestItems['subscriptions-table'].Keys,
				},
			},
		}));

		const promise = enqueueUnstoredPurchaseTokenShared(makeChecks(1));
		await expect(promise).rejects.toBeInstanceOf(ProcessingError);
		await expect(promise).rejects.toMatchObject({ shouldRetry: true });
	}, 10_000);

	it('does not touch SQS when everything is already stored', async () => {
		mockDynamo((cmd) => ({
			Responses: {
				'subscriptions-table':
					cmd.input.RequestItems['subscriptions-table'].Keys,
			},
		}));

		const sent = await enqueueUnstoredPurchaseTokenShared(makeChecks(5));
		expect(sent).toBe(0);
		expect(sqsSend).not.toHaveBeenCalled();
	});

	it('collapses duplicate subscriptionIds to a single SQS reference', async () => {
		mockDynamo(() => ({ Responses: { 'subscriptions-table': [] } }));
		mockSqs((cmd) => ({ Successful: cmd.input.Entries }));

		await enqueueUnstoredPurchaseTokenShared([
			{ subscriptionId: 'tx-1', subscriptionReference: { receipt: 'a' } },
			{ subscriptionId: 'tx-1', subscriptionReference: { receipt: 'b' } },
		]);

		const [sqs] = commandsOfType('SendMessageBatchCommand');
		expect(sqs.input.Entries).toHaveLength(1);
	});

	it('rejects with a retryable ProcessingError when SQS reports failures', async () => {
		mockDynamo(() => ({ Responses: { 'subscriptions-table': [] } }));
		mockSqs(() => ({
			Successful: [],
			Failed: [{ Id: '0', Code: 'InternalError' }],
		}));

		const promise = enqueueUnstoredPurchaseTokenShared(makeChecks(1));
		await expect(promise).rejects.toBeInstanceOf(ProcessingError);
		await expect(promise).rejects.toMatchObject({ shouldRetry: true });
	});

	it('throws before any SQS call when QueueUrl is missing', async () => {
		delete process.env.QueueUrl;
		mockDynamo(() => ({ Responses: { 'subscriptions-table': [] } }));

		await expect(
			enqueueUnstoredPurchaseTokenShared(makeChecks(1)),
		).rejects.toThrow('No QueueUrl env parameter provided');
		expect(sqsSend).not.toHaveBeenCalled();
	});
});
