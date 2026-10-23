import { mockClient } from 'aws-sdk-client-mock';
import {
	DynamoDBDocumentClient,
	BatchGetCommand,
	BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import { SQSClient, SendMessageBatchCommand } from '@aws-sdk/client-sqs';
import { UserSubscription } from '../common/userSubscription';
import { subscriptionsFullTableName } from '../common/subscription';
import { userSubscriptionsFullTableName } from '../common/userSubscription';

import {
	persistUserSubscriptionLinks,
	enqueueUnstoredPurchaseToken,
} from './googleLinkUserSubscription';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const sqsMock = mockClient(SQSClient);

describe('DynamoDB Chunking and Retry Persistence Layer', () => {
	beforeEach(() => {
		dynamoMock.reset();
		sqsMock.reset();
		process.env.QueueUrl = 'https://mock-queue-url.com';
	});

	describe('persistUserSubscriptionLinks (BatchWrite Chunking)', () => {
		it('should split 60 items into chunks of 25, 25, and 10 and safely retry unprocessed items', async () => {
			const mockSub = new UserSubscription(
				'user-123',
				'token-abc',
				'2026-01-01',
			);
			const mockItems = Array(60).fill(mockSub);
			const tableName = userSubscriptionsFullTableName();

			dynamoMock
				.on(BatchWriteCommand)
				.resolvesOnce({
					UnprocessedItems: {
						[tableName]: [
							{ PutRequest: { Item: JSON.parse(JSON.stringify(mockSub)) } },
						],
					},
				})
				.resolvesOnce({})
				.resolvesOnce({})
				.resolvesOnce({});

			const result = await persistUserSubscriptionLinks(mockItems);

			expect(result).toBe(60);
			const calls = dynamoMock.commandCalls(BatchWriteCommand);
			expect(calls.length).toBe(4);

			// Verify each explicit step
			expect(calls[0].args[0].input.RequestItems[tableName].length).toBe(25);
			expect(calls[1].args[0].input.RequestItems[tableName].length).toBe(1);
			expect(calls[2].args[0].input.RequestItems[tableName].length).toBe(25);
			expect(calls[3].args[0].input.RequestItems[tableName].length).toBe(10);
		});
	});

	describe('enqueueUnstoredPurchaseToken (BatchGet Chunking)', () => {
		it('should split 120 keys into chunks of 100 and 20, filtering and sending remaining elements to SQS', async () => {
			const tableName = subscriptionsFullTableName();
			const mockChecks = Array.from({ length: 120 }, (_, i) => ({
				subscriptionId: `token-${i}`,
				subscriptionReference: {
					packageName: 'com.guardian',
					purchaseToken: `token-${i}`,
					subscriptionId: `sub-${i}`,
				},
			}));

			// Chunk 1 returns 90 records (10 keys are missing and will be sent to SQS)
			const mockResponsesChunk1 = Array.from({ length: 90 }, (_, i) => ({
				subscriptionId: `token-${i}`,
			}));
			// Chunk 2 returns 20 records cleanly
			const mockResponsesChunk2 = Array.from({ length: 20 }, (_, i) => ({
				subscriptionId: `token-${i + 100}`,
			}));

			dynamoMock
				.on(BatchGetCommand)
				.resolvesOnce({ Responses: { [tableName]: mockResponsesChunk1 } })
				.resolvesOnce({ Responses: { [tableName]: mockResponsesChunk2 } });

			sqsMock
				.on(SendMessageBatchCommand)
				.resolves({ Successful: Array(10).fill({}), Failed: [] });

			const result = await enqueueUnstoredPurchaseToken(mockChecks);
			result;

			const getCalls = dynamoMock.commandCalls(BatchGetCommand);
			expect(getCalls.length).toBe(2);

			// Verify precise chunking slices
			expect(
				getCalls[0].args[0].input.RequestItems[tableName].Keys.length,
			).toBe(100);
			expect(
				getCalls[1].args[0].input.RequestItems[tableName].Keys.length,
			).toBe(20);

			const sqsCalls = sqsMock.commandCalls(SendMessageBatchCommand);
			expect(sqsCalls.length).toBe(1);
		});
	});
});
