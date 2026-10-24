import { handler } from './feastGoogleUpdateSubscriptions';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import {
	CloudWatchClient,
	PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch';
import { fetchGoogleSubscription } from '../common/google-play';
import { fetchGoogleSubscriptionV2 } from '../common/google-play-v2';
import { getIdentityIdFromBraze } from '../common/braze';
import { putSubscription } from '../common/updatesub';
import type { SQSEvent } from 'aws-lambda';
import { ProcessingError } from '../common/processingError';
import { GracefulProcessingError } from '../common/GracefulProcessingError';

// -----------------------------------------------------------------------------
// Mock Client instances

const dynamoMock = mockClient(DynamoDBClient);
const sqsMock = mockClient(SQSClient);
const cloudWatchMock = mockClient(CloudWatchClient);

// -----------------------------------------------------------------------------
// Mock common

jest.mock('../common/google-play');
jest.mock('../common/google-play-v2');
jest.mock('../common/braze');
jest.mock('../common/updatesub');

// -----------------------------------------------------------------------------
// Console calibration

jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});

// -----------------------------------------------------------------------------
// Intercept S3 extra-metadata access attempts inside the test runner environment

jest.mock('../common/google-subscription-extra', () => ({
	extraction: jest.fn().mockResolvedValue(undefined),
}));

// -----------------------------------------------------------------------------
// tests

describe('Feast Google Update Subscriptions Lambda Migration', () => {
	beforeEach(() => {
		jest.clearAllMocks();

		// Reset mock wrapper history call logs between individual iterations
		dynamoMock.reset();
		sqsMock.reset();
		cloudWatchMock.reset();

		// Setup environment parameters required by production functions
		process.env.HistoricalQueueUrl = 'https://sqs.mock-historical-queue-url';
		process.env.Stage = 'CODE';
		process.env.AWS_REGION = 'eu-west-1';

		// Default successful pass-through for common/updatesub dependency
		(putSubscription as jest.Mock).mockImplementation((sub) =>
			Promise.resolve(sub),
		);
	});

	const createMockSqsEvent = (bodyPayload: object): SQSEvent => ({
		Records: [
			{
				body: JSON.stringify(bodyPayload),
				messageId: 'mock-msg-1',
				receiptHandle: 'mock-handle',
				attributes: {} as any,
				messageAttributes: {},
				md5OfBody: 'md5',
				eventSource: 'aws:sqs',
				eventSourceARN: 'arn:aws:aws:sqs:eu-west-1:123456789012:queue',
				awsRegion: 'eu-west-1',
			},
		],
	});

	it('should verify standard subscriber updates map user records as plain persistence items when Braze resolves a valid ID', async () => {
		(fetchGoogleSubscriptionV2 as jest.Mock).mockResolvedValue({
			startTime: new Date('2026-01-01T00:00:00.000Z'),
			expiryTime: new Date('2026-02-01T00:00:00.000Z'),
			autoRenewing: true,
			productId: 'feast-monthly',
			obfuscatedExternalAccountId: 'braze-uuid-12345',
			billingPeriodDuration: 'P1M',
		});
		(fetchGoogleSubscription as jest.Mock).mockResolvedValue({
			startTimeMillis: '1767225600000',
			expiryTimeMillis: '1769904000000',
			autoRenewing: true,
			paymentState: 1,
		});

		(getIdentityIdFromBraze as jest.Mock).mockResolvedValue({
			identityId: 'identity-user-999',
		});

		const event = createMockSqsEvent({
			purchaseToken: 'token-abc-123',
			packageName: 'uk.co.guardian.feast',
			subscriptionId: 'sub-id-monthly',
		});

		const response = await handler(event);
		expect(response).toBe('OK');

		const ddbCalls = dynamoMock.commandCalls(PutItemCommand);
		expect(ddbCalls).toHaveLength(1);

		const commandInput = ddbCalls[0].args[0].input;
		expect(commandInput.Item).toBeDefined();
		expect(commandInput.Item.userId).toEqual({ S: 'identity-user-999' });
		expect(commandInput.Item.subscriptionId).toEqual({ S: 'token-abc-123' });
		expect(commandInput.Item.creationTimestamp).toBeDefined();

		expect(sqsMock.commandCalls(SendMessageCommand)).toHaveLength(1);
	});

	it('should gracefully skip the user-subscription mapping loop when the token contains no obfuscated account identifier', async () => {
		(fetchGoogleSubscriptionV2 as jest.Mock).mockResolvedValue({
			startTime: new Date('2026-01-01T00:00:00.000Z'),
			expiryTime: new Date('2026-02-01T00:00:00.000Z'),
			autoRenewing: true,
			productId: 'feast-monthly',
			obfuscatedExternalAccountId: undefined,
			billingPeriodDuration: 'P1M',
		});
		(fetchGoogleSubscription as jest.Mock).mockResolvedValue({
			startTimeMillis: '1767225600000',
			expiryTimeMillis: '1769904000000',
			autoRenewing: true,
		});

		const event = createMockSqsEvent({
			purchaseToken: 'token-no-account',
			packageName: 'uk.co.guardian.feast',
			subscriptionId: 'sub-id-monthly',
		});

		const response = await handler(event);
		expect(response).toBe('OK');

		expect(dynamoMock.commandCalls(PutItemCommand)).toHaveLength(0);
		expect(getIdentityIdFromBraze).not.toHaveBeenCalled();
	});

	it('should dispatch a CloudWatch metric log when Braze profile resolution yields an empty identity definition', async () => {
		(fetchGoogleSubscriptionV2 as jest.Mock).mockResolvedValue({
			startTime: new Date('2026-01-01T00:00:00.000Z'),
			expiryTime: new Date('2026-02-01T00:00:00.000Z'),
			autoRenewing: true,
			productId: 'feast-monthly',
			obfuscatedExternalAccountId: 'unresolvable-uuid',
			billingPeriodDuration: 'P1M',
		});
		(fetchGoogleSubscription as jest.Mock).mockResolvedValue({
			startTimeMillis: '1767225600000',
			expiryTimeMillis: '1769904000000',
			autoRenewing: true,
		});

		(getIdentityIdFromBraze as jest.Mock).mockResolvedValue({
			identityId: undefined,
		});

		const event = createMockSqsEvent({
			purchaseToken: 'token-missing-identity',
			packageName: 'uk.co.guardian.feast',
			subscriptionId: 'sub-id-monthly',
		});

		const response = await handler(event);
		expect(response).toBe('OK');

		const cwCalls = cloudWatchMock.commandCalls(PutMetricDataCommand);
		expect(cwCalls).toHaveLength(1);

		const metricCommandInput = cwCalls[0].args[0].input;
		expect(metricCommandInput?.Namespace).toBe('soft-opt-ins');
		expect(metricCommandInput?.MetricData?.[0]?.MetricName).toBe(
			'feast_google_update_subs_missing_identity_id',
		);
	});

	it('should re-throw a ProcessingError if shouldRetry is marked as true to trigger SQS retries', async () => {
		const retryableError = new ProcessingError(
			'Temporary network timeout',
			true,
		);
		(fetchGoogleSubscriptionV2 as jest.Mock).mockRejectedValue(retryableError);

		const event = createMockSqsEvent({
			purchaseToken: 'token-retry-test',
			packageName: 'uk.co.guardian.feast',
			subscriptionId: 'sub-id-monthly',
		});

		await expect(handler(event)).rejects.toThrow('Temporary network timeout');
	});

	it('should swallow a GracefulProcessingError and return OK to cleanly delete the message from SQS', async () => {
		const gracefulError = new GracefulProcessingError(
			'Purchase expired a very long time ago',
		);
		(fetchGoogleSubscriptionV2 as jest.Mock).mockRejectedValue(gracefulError);

		const event = createMockSqsEvent({
			purchaseToken: 'token-graceful-test',
			packageName: 'uk.co.guardian.feast',
			subscriptionId: 'sub-id-monthly',
		});

		const response = await handler(event);
		expect(response).toBe('OK');
	});
});
