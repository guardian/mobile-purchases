import 'source-map-support/register';
import { marshall } from '@aws-sdk/util-dynamodb';
import { NumberValue } from '@aws-sdk/lib-dynamodb';

// -----------------------------------------------------------------------------
// Global Definitions

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

jest.mock('@aws-sdk/util-dynamodb', () => {
	const actual = jest.requireActual('@aws-sdk/util-dynamodb');
	return {
		...actual,
		marshall: jest.fn(actual.marshall),
	};
});

// We can only import this here... (do not move)
import { putSubscription } from './appleUpdateSubscriptions';
import { Subscription } from '../common/subscription';

const marshallSpy = marshall as unknown as jest.Mock;

// -----------------------------------------------------------------------------
// Tests

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

	it('wraps unsafe integers nested in applePayload objects and arrays', async () => {
		// These must be exactly representable as IEEE-754 doubles, otherwise the
		// literal itself is rounded before it ever reaches wrapUnsafeNumbers.
		// (See the fixture note below.)
		const UNSAFE_A = 501302004174107840; // exact: multiple of 128
		const UNSAFE_B = 9007199254740994; // MAX_SAFE_INTEGER + 2 (even -> exact)
		const UNSAFE_C = 9007199254740996; // MAX_SAFE_INTEGER + 4 (multiple of 4 -> exact)

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
			{
				latestReceiptInfo: {
					transactionId: UNSAFE_A,
					originalTransactionId: '200000000000012345', // string id: stays S
					quantity: 2, // safe number: stays a real number
					webOrderLineItemId: '100000000000000001',
					inApp: [
						{
							transactionId: UNSAFE_B,
							purchaseDate: UNSAFE_C,
							quantity: 1,
							productId: 'premium_monthly',
						},
						{
							transactionId: 123, // safe, inside array
							productId: 'premium_yearly',
						},
					],
				},
			},
			1793740800,
			'{"storekit_metadata": true}',
		);

		await expect(putSubscription(mockSubscription)).resolves.toBe(
			mockSubscription,
		);

		expect(mockSend).toHaveBeenCalledTimes(1);
		const calledCommand = mockSend.mock.calls[0][0];
		expect(calledCommand.input.TableName).toBe(
			'Test-App-Test-Stage-subscriptions',
		);

		const item = calledCommand.input.Item;

		expect(item.applePayload.M.latestReceiptInfo.M.transactionId).toEqual({
			N: '501302004174107840',
		});
		expect(
			item.applePayload.M.latestReceiptInfo.M.inApp.L[0].M.transactionId,
		).toEqual({ N: '9007199254740994' });
		expect(
			item.applePayload.M.latestReceiptInfo.M.inApp.L[0].M.purchaseDate,
		).toEqual({ N: '9007199254740996' });

		expect(item.applePayload.M.latestReceiptInfo.M.quantity).toEqual({
			N: '2',
		});
		expect(
			item.applePayload.M.latestReceiptInfo.M.inApp.L[1].M.transactionId,
		).toEqual({ N: '123' });

		expect(
			item.applePayload.M.latestReceiptInfo.M.originalTransactionId,
		).toEqual({ S: '200000000000012345' });
		expect(item.applePayload.M.latestReceiptInfo.M.webOrderLineItemId).toEqual({
			S: '100000000000000001',
		});

		expect(item.applePayload.M.latestReceiptInfo.M.inApp.L).toHaveLength(2);

		const preMarshal = marshallSpy.mock.calls[0][0] as Record<string, any>;
		const lri = preMarshal.applePayload.latestReceiptInfo;
		expect(lri.transactionId).toBeInstanceOf(NumberValue);
		expect(lri.inApp[0].transactionId).toBeInstanceOf(NumberValue);
		expect(lri.inApp[0].purchaseDate).toBeInstanceOf(NumberValue);
		expect(typeof lri.quantity).toBe('number');
		expect(lri.inApp[1].transactionId).toBe(123);
		expect(typeof lri.originalTransactionId).toBe('string');
		expect(lri.originalTransactionId).toBe('200000000000012345');
	});
});
