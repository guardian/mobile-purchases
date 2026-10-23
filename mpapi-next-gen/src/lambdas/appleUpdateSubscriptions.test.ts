import { marshall } from '@aws-sdk/util-dynamodb';

// 1. Mock the client before importing the handler to catch the prototype cleanly
const mockSend = jest.fn();
jest.mock('@aws-sdk/client-dynamodb', () => {
	return {
		DynamoDBClient: class {
			send = mockSend;
		},
		PutItemCommand: class {
			constructor(public input: any) {}
		},
	};
});

jest.mock('../common/subscription', () => {
	const actual = jest.requireActual('../common/subscription');
	return {
		...actual,
		subscriptionsFullTableName: () => 'Test-App-Test-Stage-subscriptions',
	};
});

// We can only import this here...
import { putSubscription } from './appleUpdateSubscriptions';
import { Subscription } from '../common/subscription';

describe('putSubscription', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockSend.mockResolvedValue({});
	});

	it('should marshal a plain persistence object and successfully call PutItemCommand', async () => {
		const mockSubscription = new Subscription(
			'sub_abc123',
			'2026-10-01T00:00:00.000Z',
			'2026-11-01T00:00:00.000Z',
			undefined,
			true,
			'premium_monthly',
			'ios',
			false,
			'P1M',
			null,
			'receipt_token_string',
			{ latestReceiptInfo: {} },
			1793740800,
			'{"storekit_metadata": true}',
		);

		const result = await putSubscription(mockSubscription);

		expect(mockSend).toHaveBeenCalledTimes(1);

		// Extract the actual command instance passed as the first parameter
		const calledCommand = mockSend.mock.calls[0][0];

		// Verify TableName resolution
		expect(calledCommand.input.TableName).toBe(
			'Test-App-Test-Stage-subscriptions',
		);

		// Explicitly construct the expected plain data shape
		const expectedPlainObject = {
			subscriptionId: 'sub_abc123',
			startTimestamp: '2026-10-01T00:00:00.000Z',
			endTimestamp: '2026-11-01T00:00:00.000Z',
			autoRenewing: true,
			productId: 'premium_monthly',
			platform: 'ios',
			freeTrial: false,
			billingPeriod: 'P1M',
			googlePayload: null,
			receipt: 'receipt_token_string',
			applePayload: { latestReceiptInfo: {} },
			ttl: 1793740800,
			extra: '{"storekit_metadata": true}',
		};

		// Check that the marshalled structure matches what is expected from a plain object literal
		expect(calledCommand.input.Item).toEqual(
			marshall(expectedPlainObject, { removeUndefinedValues: true }),
		);

		expect(result).toBe(mockSubscription);
	});
});
