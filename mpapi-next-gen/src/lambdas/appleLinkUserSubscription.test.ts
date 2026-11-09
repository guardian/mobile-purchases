import 'source-map-support/register';
import { Platform } from '../common/platform';
import {
	toUserSubscription,
	toSqsPayload,
	parseAppleLinkPayload,
	AppleLinkPayload,
} from './appleLinkUserSubscription';
import {
	persistUserSubscriptionLinksShared,
	enqueueUnstoredPurchaseTokenShared,
} from '../common/sharedLink';
import { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../common/sharedLink', () => ({
	persistUserSubscriptionLinksShared: jest.fn(),
	enqueueUnstoredPurchaseTokenShared: jest.fn(),
}));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Apple Link Handler Primitives', () => {
	const mockUserId = 'user-12345';

	const samplePayloadData = {
		platform: Platform.Ios,
		subscriptions: [
			{ receipt: 'receipt-aaa', originalTransactionId: 'tx-1' },
			{ receipt: 'receipt-bbb', originalTransactionId: 'tx-2' },
			{ receipt: 'receipt-aaa', originalTransactionId: 'tx-1' },
		],
	};

	const mockEvent = {
		body: JSON.stringify(samplePayloadData),
	} as APIGatewayProxyEvent;

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('parseAppleLinkPayload', () => {
		it('should extract body elements and strip duplicate transaction structures', () => {
			const parsed = parseAppleLinkPayload(mockEvent);
			expect(parsed.subscriptions).toHaveLength(2);
			expect(parsed.subscriptions[0].originalTransactionId).toBe('tx-1');
			expect(parsed.subscriptions[1].originalTransactionId).toBe('tx-2');
		});
	});

	describe('toUserSubscription', () => {
		it('should correctly format UserSubscription model structures from configuration inputs', () => {
			const parsedPayload = parseAppleLinkPayload(mockEvent);
			const models = toUserSubscription(mockUserId, parsedPayload);

			expect(models).toHaveLength(2);
			expect(models[0].userId).toBe(mockUserId);
			expect(models[0].subscriptionId).toBe('tx-1');
			expect(models[0].creationTimestamp).toBeDefined();
		});
	});

	describe('toSqsPayload Partition Rules', () => {
		it('should append clean lookup parameters for standard Non-Feast applications', () => {
			const parsedPayload = parseAppleLinkPayload(mockEvent);
			const sqsMessages = toSqsPayload(parsedPayload);

			expect(sqsMessages).toHaveLength(2);
			expect(sqsMessages[0]).toEqual({
				subscriptionId: 'tx-1',
				subscriptionReference: { receipt: 'receipt-aaa' },
			});
		});

		it('should catch Feast platform parameters and return an empty block to bypass SQS updates', () => {
			const feastPayload: AppleLinkPayload = {
				platform: Platform.IosFeast,
				subscriptions: [
					{ receipt: 'receipt-fff', originalTransactionId: 'tx-feast' },
				],
			};
			const sqsMessages = toSqsPayload(feastPayload);
			expect(sqsMessages).toHaveLength(0);
		});
	});

	describe('sharedLink Execution Pipelines Integration', () => {
		it('should confirm persistUserSubscriptionLinksShared receives the mapped structural array values accurately', async () => {
			(persistUserSubscriptionLinksShared as jest.Mock).mockResolvedValue(2);

			const parsedPayload = parseAppleLinkPayload(mockEvent);
			const links = toUserSubscription(mockUserId, parsedPayload);

			const result = await persistUserSubscriptionLinksShared(links);
			expect(result).toBe(2);

			expect(persistUserSubscriptionLinksShared).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({
						userId: mockUserId,
						subscriptionId: 'tx-1',
					}),
				]),
			);
		});

		it('should confirm enqueueUnstoredPurchaseTokenShared receives the partitioned SQS body collection payload arrays', async () => {
			(enqueueUnstoredPurchaseTokenShared as jest.Mock).mockResolvedValue(2);

			const parsedPayload = parseAppleLinkPayload(mockEvent);
			const queuePayload = toSqsPayload(parsedPayload);

			const result = await enqueueUnstoredPurchaseTokenShared(queuePayload);
			expect(result).toBe(2);

			expect(enqueueUnstoredPurchaseTokenShared).toHaveBeenCalledWith(
				expect.arrayContaining([
					expect.objectContaining({
						subscriptionId: 'tx-1',
						subscriptionReference: { receipt: 'receipt-aaa' },
					}),
				]),
			);
		});
	});
});
