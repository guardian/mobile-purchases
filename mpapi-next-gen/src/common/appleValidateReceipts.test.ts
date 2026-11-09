import { validateReceipt } from './appleValidateReceipts';
import { App } from './app';
import { ProcessingError } from './processingError';
import { GracefulProcessingError } from './GracefulProcessingError';
import { getParameterValueUsingAppStageStackConvention } from './ssmParameters';

// Mock shared common dependencies
jest.mock('./ssmParameters');
jest.mock('./appIdentity', () => ({
	Stage: 'CODE',
}));

describe('Apple Receipt Validation Module', () => {
	const mockReceipt = 'mock-receipt-string-data';
	const mockOptions = { sandboxRetry: true };

	beforeEach(() => {
		jest.clearAllMocks();
		global.fetch = jest.fn();
		jest.spyOn(console, 'log').mockImplementation(() => {});
		jest.spyOn(console, 'error').mockImplementation(() => {});
		jest.spyOn(console, 'warn').mockImplementation(() => {});

		(
			getParameterValueUsingAppStageStackConvention as jest.Mock
		).mockResolvedValue('mock-apple-shared-password');
	});

	describe('Network Timeouts and Fault Handling', () => {
		it('should reject with AbortError if the network connection hits the 10 seconds boundary constraint', async () => {
			const abortError = new Error('The user aborted a request.');
			abortError.name = 'AbortError';

			(global.fetch as jest.Mock).mockRejectedValueOnce(abortError);

			await expect(validateReceipt(mockReceipt, mockOptions)).rejects.toThrow(
				'The user aborted a request.',
			);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining(
					'[fc6406e3] the request timed out after 10 seconds.',
				),
			);
		});

		it('should raise a retryable ProcessingError if fetch responds with a non-200 status flag', async () => {
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: false,
				status: 502,
				statusText: 'Bad Gateway',
			});

			await expect(validateReceipt(mockReceipt, mockOptions)).rejects.toThrow(
				ProcessingError,
			);
			expect(console.error).toHaveBeenCalledWith(
				expect.stringContaining(
					'[c994cb19] impossible to validate the receipt',
				),
			);
		});
	});

	describe('Environment Divergence Sandbox Fallback Routing (Status 21007)', () => {
		it('should fallback execution paths and hit the sandbox server endpoint if sandboxRetry config parameter is active', async () => {
			const productionPayloadResponse = { status: 21007 };
			const sandboxPayloadResponse = {
				status: 0,
				auto_renew_status: 1,
				latest_receipt: 'sandbox-receipt-token',
				latest_receipt_info: {
					original_transaction_id: 'tx-999',
					product_id: 'feast-monthly-sub',
					original_purchase_date_ms: '1767225600000',
					expires_date_ms: '1769904000000',
					is_trial_period: 'false',
					is_in_intro_offer_period: 'false',
					bundle_id: 'uk.co.guardian.feast',
				},
			};

			(global.fetch as jest.Mock)
				.mockResolvedValueOnce({
					ok: true,
					text: () =>
						Promise.resolve(JSON.stringify(productionPayloadResponse)),
				})
				.mockResolvedValueOnce({
					ok: true,
					text: () => Promise.resolve(JSON.stringify(sandboxPayloadResponse)),
				});

			const results = await validateReceipt(
				mockReceipt,
				mockOptions,
				App.Feast,
			);

			expect(global.fetch).toHaveBeenCalledTimes(2);
			expect(results).toHaveLength(1);
			expect(results[0].latestReceipt).toBe('sandbox-receipt-token');
			expect(results[0].latestReceiptInfo.productId).toBe('feast-monthly-sub');
		});

		it('should directly raise a non-retryable GracefulProcessingError on 21007 responses when sandboxRetry parameter is disabled', async () => {
			const productionPayloadResponse = { status: 21007 };
			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(JSON.stringify(productionPayloadResponse)),
			});

			await expect(
				validateReceipt(mockReceipt, { sandboxRetry: false }),
			).rejects.toThrow(GracefulProcessingError);
		});
	});

	describe('Payload Translation and Sanitisation Layer', () => {
		it('should accurately unpack latest_receipt_info structure arrays, sorting by date and de-duplicating on transaction IDs', async () => {
			const multiRecordServerResponse = {
				status: 0,
				auto_renew_status: 1,
				latest_receipt: 'deduped-receipt-context',
				latest_receipt_info: [
					{
						original_transaction_id: 'tx-dup-1',
						product_id: 'feast-tier-1',
						original_purchase_date_ms: '1767225600000',
						expires_date_ms: '1769904000000',
						is_trial_period: 'false',
						is_in_intro_offer_period: 'false',
						bid: 'uk.co.guardian.feast',
					},
					{
						original_transaction_id: 'tx-dup-1',
						product_id: 'feast-tier-2',
						original_purchase_date_ms: '1767225600000',
						expires_date_ms: '1772582400000',
						is_trial_period: 'false',
						is_in_intro_offer_period: 'false',
						bundle_id: 'uk.co.guardian.feast',
					},
				],
			};

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				text: () => Promise.resolve(JSON.stringify(multiRecordServerResponse)),
			});

			const structures = await validateReceipt(mockReceipt, mockOptions);

			expect(structures).toHaveLength(1);
			expect(structures[0].latestReceiptInfo.productId).toBe('feast-tier-2');
			expect(structures[0].latestReceiptInfo.bundleId).toBe(
				'uk.co.guardian.feast',
			);
		});

		it('should enforce fallback verification policies matching undocumented shorthand bid keys to bundleId attributes', async () => {
			const alternativeKeyServerResponse = {
				status: 0,
				auto_renew_status: 0,
				latest_receipt_info: {
					original_transaction_id: 'tx-bid-fallback',
					product_id: 'feast-annual',
					original_purchase_date_ms: '1767225600000',
					expires_date_ms: '1769904000000',
					is_trial_period: 'true',
					is_in_intro_offer_period: 'false',
					bid: 'undocumented-bid-value',
				},
			};

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				text: () =>
					Promise.resolve(JSON.stringify(alternativeKeyServerResponse)),
			});

			const structuralOutputs = await validateReceipt(mockReceipt, mockOptions);
			expect(structuralOutputs[0].latestReceiptInfo.bundleId).toBe(
				'undocumented-bid-value',
			);
			expect(structuralOutputs[0].latestReceiptInfo.trialPeriod).toBe(true);
		});

		it('should abort transformation mappings with a non-retryable processing crash if no active records exist', async () => {
			const structuralAnomaliesResponse = {
				status: 0,
				latest_receipt_info: [],
			};

			(global.fetch as jest.Mock).mockResolvedValueOnce({
				ok: true,
				text: () =>
					Promise.resolve(JSON.stringify(structuralAnomaliesResponse)),
			});

			await expect(validateReceipt(mockReceipt, mockOptions)).rejects.toThrow(
				'Invalid validation response, empty receipt info array',
			);
		});
	});
});
