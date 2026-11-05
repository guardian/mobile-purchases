import { handler } from './feastAppleUpdateSubscriptions';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
	CloudWatchClient,
	PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { validateReceipt } from '../common/appleValidateReceipts';
import { getIdentityIdFromBraze } from '../common/braze';
import { transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra } from '../common/api-storekit';
import { GracefulProcessingError } from '../common/GracefulProcessingError';

const dynamoMock = mockClient(DynamoDBClient);
const sqsMock = mockClient(SQSClient);
const cloudWatchMock = mockClient(CloudWatchClient);

// Mock Apple-specific business collaborators
jest.mock('../common/appleValidateReceipts');
jest.mock('../common/braze');
jest.mock('../common/api-storekit');

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'log').mockImplementation(() => {});

describe('Feast Apple Update Subscriptions Lambda Integration', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		dynamoMock.reset();
		sqsMock.reset();
		cloudWatchMock.reset();

		process.env.HistoricalQueueUrl = 'https://sqs.mock-historical-queue-url';
		process.env.Stage = 'CODE';
		process.env.AWS_REGION = 'eu-west-1';
	});

	const createMockSqsEvent = (bodyPayload: object) => ({
		Records: [
			{
				body: JSON.stringify(bodyPayload),
				messageId: 'mock-msg-apple-1',
				receiptHandle: 'mock-handle-apple',
				attributes: {} as any,
				messageAttributes: {},
				md5OfBody: 'md5',
				eventSource: 'aws:sqs',
				eventSourceARN: 'arn:aws:sqs:eu-west-1:123456789012:queue',
				awsRegion: 'eu-west-1',
			},
		],
	});

	it('should verify standard subscription write, historical queue message, and plain user subscription write when appAccountToken resolves to a Braze identity', async () => {
		const mockAppleResponse = {
			isRetryable: false,
			latestReceipt: 'mock-base64-receipt-string',
			originalResponse: { status: 0, receipt: {} },
			latestReceiptInfo: {
				bundleId: 'uk.co.guardian.Feast',
				autoRenewStatus: true,
				cancellationDate: null,
				expiresDate: new Date('2026-02-01T00:00:00.000Z'),
				originalPurchaseDate: new Date('2026-01-01T00:00:00.000Z'),
				originalTransactionId: 'apple-tx-100200',
				productId: 'uk.co.guardian.Feast.monthly',
				trialPeriod: false,
				inIntroOfferPeriod: false,
				appAccountToken: 'braze-uuid-token-123',
			},
		};

		(validateReceipt as jest.Mock).mockResolvedValue([mockAppleResponse]);
		(
			transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra as jest.Mock
		).mockResolvedValue({
			extra: { sampleMeta: 'value' },
		});
		(getIdentityIdFromBraze as jest.Mock).mockResolvedValue({
			identityId: 'identity-apple-user-777',
		});

		const event = createMockSqsEvent({
			receipt: 'mock-base64-receipt-string',
		});

		const response = await handler(event as any);
		expect(response).toBe('OK');

		const ddbCalls = dynamoMock.commandCalls(PutItemCommand);
		expect(ddbCalls.length).toBeGreaterThanOrEqual(1);

		const userSubCall = ddbCalls.find((call) => {
			const commandInstance = call.args[0];
			return commandInstance?.input?.Item?.userId !== undefined;
		});
		expect(userSubCall).toBeDefined();

		const userSubInput = userSubCall!.args[0].input;
		expect(userSubInput.Item.userId).toEqual({ S: 'identity-apple-user-777' });
		expect(userSubInput.Item.subscriptionId).toEqual({ S: 'apple-tx-100200' });
		expect(userSubInput.Item.creationTimestamp).toBeDefined();

		expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(1);
	});

	it('should gracefully bypass Braze mapping entirely when the payload contains no appAccountToken', async () => {
		(validateReceipt as jest.Mock).mockResolvedValue([
			{
				latestReceipt: 'mock-base64-receipt-string',
				originalResponse: {},
				latestReceiptInfo: {
					originalTransactionId: 'apple-tx-no-token',
					productId: 'uk.co.guardian.Feast.monthly',
					bundleId: 'uk.co.guardian.Feast',
					originalPurchaseDate: new Date('2026-01-01T00:00:00.000Z'),
					expiresDate: new Date('2026-02-01T00:00:00.000Z'),
					appAccountToken: undefined,
				},
			},
		]);

		const event = createMockSqsEvent({
			receipt: 'mock-base64-receipt-string',
		});

		const response = await handler(event as any);
		expect(response).toBe('OK');

		const ddbCalls = dynamoMock.commandCalls(PutItemCommand);
		const userSubCall = ddbCalls.find((call) => {
			const commandInstance = call.args[0];
			return commandInstance?.input?.Item?.userId !== undefined;
		});
		expect(userSubCall).toBeUndefined();
		expect(getIdentityIdFromBraze).not.toHaveBeenCalled();
	});

	it('should log a metric to CloudWatch when an appAccountToken is supplied but Braze profile link fails to return an identity ID', async () => {
		const mockUnlinkedResponse = {
			isRetryable: false,
			latestReceipt: 'mock-base64-receipt-string',
			latestReceiptInfo: {
				bundleId: 'uk.co.guardian.Feast',
				autoRenewStatus: true,
				cancellationDate: null,
				expiresDate: new Date('2026-02-01T00:00:00.000Z'),
				originalPurchaseDate: new Date('2026-01-01T00:00:00.000Z'),
				originalTransactionId: 'apple-tx-unlinked',
				productId: 'uk.co.guardian.Feast.monthly',
				trialPeriod: false,
				inIntroOfferPeriod: false,
				appAccountToken: 'unlinked-token-uuid',
			},
		};

		(validateReceipt as jest.Mock).mockResolvedValue([mockUnlinkedResponse]);
		(getIdentityIdFromBraze as jest.Mock).mockResolvedValue({
			identityId: undefined,
		});

		const event = createMockSqsEvent({
			receipt: 'mock-base64-receipt-string',
		});

		const response = await handler(event as any);
		expect(response).toBe('OK');

		const cwCalls = cloudWatchMock.commandCalls(PutMetricDataCommand);
		expect(cwCalls).toHaveLength(1);

		const metricCommandInput = cwCalls[0].args[0].input;
		expect(metricCommandInput?.Namespace).toBe('soft-opt-ins');
		expect(metricCommandInput?.MetricData?.[0]?.MetricName).toBe(
			'feast_apple_update_subs_missing_identity_id',
		);
	});

	it('should cleanly suppress GracefulProcessingError occurrences to drop faulty requests without processing loops', async () => {
		(validateReceipt as jest.Mock).mockRejectedValue(
			new GracefulProcessingError('Receipt signature invalid'),
		);

		const event = createMockSqsEvent({
			receipt: 'bad-corrupted-receipt-string',
		});

		const response = await handler(event as any);
		expect(response).toBe('OK');
		expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(0);
	});

	it('should bubble up unexpected runtime exceptions to trigger automatic SQS visibility timeout retries', async () => {
		(validateReceipt as jest.Mock).mockRejectedValue(
			new Error('Fatal database dropout'),
		);

		const event = createMockSqsEvent({
			receipt: 'mock-base64-receipt-string',
		});

		await expect(handler(event as any)).rejects.toThrow(
			'Fatal database dropout',
		);
	});

	it('should successfully iterate over and process a multi-record batch SQS event containing multiple independent purchase receipts', async () => {
		const mockResponseOne = {
			isRetryable: false,
			latestReceipt: 'receipt-batch-aaa',
			originalResponse: { status: 0, receipt: {} },
			latestReceiptInfo: {
				bundleId: 'uk.co.guardian.Feast',
				autoRenewStatus: true,
				cancellationDate: null,
				expiresDate: new Date('2026-02-01T00:00:00.000Z'),
				originalPurchaseDate: new Date('2026-01-01T00:00:00.000Z'),
				originalTransactionId: 'apple-tx-batch-1',
				productId: 'uk.co.guardian.Feast.monthly',
				trialPeriod: false,
				inIntroOfferPeriod: false,
				appAccountToken: 'braze-uuid-token-1',
			},
		};

		const mockResponseTwo = {
			isRetryable: false,
			latestReceipt: 'receipt-batch-bbb',
			originalResponse: { status: 0, receipt: {} },
			latestReceiptInfo: {
				bundleId: 'uk.co.guardian.Feast',
				autoRenewStatus: true,
				cancellationDate: null,
				expiresDate: new Date('2026-02-01T00:00:00.000Z'),
				originalPurchaseDate: new Date('2026-01-01T00:00:00.000Z'),
				originalTransactionId: 'apple-tx-batch-2',
				productId: 'uk.co.guardian.Feast.monthly',
				trialPeriod: false,
				inIntroOfferPeriod: false,
				appAccountToken: 'braze-uuid-token-2',
			},
		};

		(validateReceipt as jest.Mock)
			.mockResolvedValueOnce([mockResponseOne])
			.mockResolvedValueOnce([mockResponseTwo]);

		(
			transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra as jest.Mock
		).mockResolvedValue({
			extra: { sampleMeta: 'batch' },
		});

		(getIdentityIdFromBraze as jest.Mock)
			.mockResolvedValueOnce({ identityId: 'identity-user-batch-1' })
			.mockResolvedValueOnce({ identityId: 'identity-user-batch-2' });

		const batchEvent = {
			Records: [
				{
					body: JSON.stringify({ receipt: 'receipt-batch-aaa' }),
					messageId: 'msg-batch-1',
				},
				{
					body: JSON.stringify({ receipt: 'receipt-batch-bbb' }),
					messageId: 'msg-batch-2',
				},
			],
		} as any;

		const response = await handler(batchEvent);
		expect(response).toBe('OK');

		const ddbCalls = dynamoMock.commandCalls(PutItemCommand);
		expect(ddbCalls.length).toBeGreaterThanOrEqual(2);

		const squashedUserIds = ddbCalls
			.map((call) => call.args[0]?.input?.Item?.userId?.S)
			.filter(Boolean);

		expect(squashedUserIds).toContain('identity-user-batch-1');
		expect(squashedUserIds).toContain('identity-user-batch-2');
	});

	describe('Apple Receipt Client Shared Transport Timeout', () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it('should reject with a timeout error if validateReceipt takes longer than 10 seconds', async () => {
			(validateReceipt as jest.Mock).mockReturnValue(new Promise(() => {}));

			const event = createMockSqsEvent({
				receipt: 'mock-hanging-apple-receipt-string',
			});

			const handlerPromise = handler(event as any);

			jest.advanceTimersByTime(10000);

			await expect(handlerPromise).rejects.toThrow(
				'Apple receipt validation timed out after 10 seconds',
			);

			expect(validateReceipt).toHaveBeenCalledWith(
				'mock-hanging-apple-receipt-string',
				{ sandboxRetry: false },
				expect.any(String),
			);
		});
	});
});
