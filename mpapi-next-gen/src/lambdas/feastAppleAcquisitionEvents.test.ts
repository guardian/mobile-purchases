import { handler } from './feastAppleAcquisitionEvents';
import { validateReceipt } from '../common/appleValidateReceipts';
import {
	transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra,
	appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline,
} from '../common/api-storekit';
import { getParameterValueUsingAppStageStackConvention } from '../common/ssmParameters';
import { restClient } from '../common/restClient';
import type { SQSEvent } from 'aws-lambda';

jest.mock('../common/appleValidateReceipts');
jest.mock('../common/api-storekit');
jest.mock('../common/ssmParameters');
jest.mock('../common/restClient', () => ({
	restClient: {
		client: {
			post: jest.fn(),
		},
	},
}));

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Feast Apple Acquisition Events Lambda', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		process.env.Stage = 'CODE';
	});

	const createMockSqsEvent = (body: object): SQSEvent => ({
		Records: [
			{
				body: JSON.stringify(body),
				messageId: 'mock-msg-id',
				receiptHandle: 'mock-handle',
				attributes: {} as any,
				messageAttributes: {},
				md5OfBody: 'md5',
				eventSource: 'aws:sqs',
				eventSourceARN: 'arn:aws:sqs',
				awsRegion: 'eu-west-1',
			},
		],
	});

	it('should process a PROD payload with critical acquisition fields and post to the Acquisition API', async () => {
		process.env.Stage = 'PROD';

		let isolatedHandler: any;
		jest.isolateModules(() => {
			const module = require('./feastAppleAcquisitionEvents');
			isolatedHandler = module.handler;
		});

		(
			getParameterValueUsingAppStageStackConvention as jest.Mock
		).mockResolvedValue('https://guardian.com');

		const mockAppleResponse = {
			latestReceipt: 'mock-receipt-data',
			originalResponse: { status: 0 },
			latestReceiptInfo: {
				originalTransactionId: 'tx-12345',
				bundleId: 'uk.co.guardian.Feast',
				autoRenewStatus: true,
				cancellationDate: null,
				productId: 'uk.co.guardian.Feast.monthly',
				originalPurchaseDate: new Date('2026-01-01T12:00:00.000Z'),
				expiresDate: new Date('2026-02-01T12:00:00.000Z'),
			},
		};

		(validateReceipt as jest.Mock).mockResolvedValue([mockAppleResponse]);
		(
			transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra as jest.Mock
		).mockResolvedValue({
			sampleExtraMeta: 'extra-value',
		});
		(
			appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline as jest.Mock
		).mockResolvedValue({
			country: 'GB',
			currency: 'GBP',
			paymentFrequency: 'MONTHLY',
		});

		const event = createMockSqsEvent({ receipt: 'mock-receipt-data' });

		await isolatedHandler(event);

		expect(getParameterValueUsingAppStageStackConvention).toHaveBeenCalledWith(
			'acquisitionApiUrl',
		);
		expect(restClient.client.post).toHaveBeenCalledTimes(1);

		const [url, body, headers] = (restClient.client.post as jest.Mock).mock
			.calls[0];
		expect(url).toBe('https://guardian.com');
		expect(headers).toEqual({ 'Content-Type': 'application/json' });

		const payload = JSON.parse(body);
		expect(payload.eventTimeStamp).toBe('2026-01-01T12:00:00.000Z');
		expect(payload.product).toBe('FEAST_APP');
		expect(payload.country).toBe('GB');
		expect(payload.currency).toBe('GBP');
		expect(payload.paymentFrequency).toBe('MONTHLY');
		expect(payload.paymentId).toBe('tx-12345');
		expect(payload.readerType).toBe('Direct');
		expect(payload.acquisitionType).toBe('PURCHASE');
	});

	it('should cleanly perform a no-op when the incoming message does not contain a receipt field', async () => {
		const event = createMockSqsEvent({ subscriptionId: 'some-random-id' });

		await handler(event);

		expect(validateReceipt).not.toHaveBeenCalled();
		expect(restClient.client.post).not.toHaveBeenCalled();
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining('[4ddde2a0] receipt is undefined'),
		);
	});

	it('should gracefully bubble up errors when the upstream Apple validation call fails', async () => {
		(validateReceipt as jest.Mock).mockRejectedValue(
			new Error('Apple Sandbox endpoint error 500'),
		);

		const event = createMockSqsEvent({ receipt: 'faulty-receipt-data' });

		await expect(handler(event)).rejects.toThrow(
			'Apple Sandbox endpoint error 500',
		);
		expect(
			appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline,
		).not.toHaveBeenCalled();
		expect(restClient.client.post).not.toHaveBeenCalled();
	});

	it('should fail cleanly and log errors when the StoreKit metadata enrichment pipeline returns undefined', async () => {
		const mockAppleResponse = {
			latestReceipt: 'mock-receipt-data',
			originalResponse: { status: 0 },
			latestReceiptInfo: {
				originalTransactionId: 'tx-12345',
				bundleId: 'uk.co.guardian.Feast',
				autoRenewStatus: true,
				cancellationDate: null,
				productId: 'uk.co.guardian.Feast.monthly',
				originalPurchaseDate: new Date('2026-01-01T12:00:00.000Z'),
				expiresDate: new Date('2026-02-01T12:00:00.000Z'),
			},
		};

		(validateReceipt as jest.Mock).mockResolvedValue([mockAppleResponse]);
		(
			transactionIdToAppleStoreKitSubscriptionDataDerivationForExtra as jest.Mock
		).mockResolvedValue(undefined);
		(
			appleSubscriptionToAppleStoreKitSubscriptionDataDerivationForFeastPipeline as jest.Mock
		).mockResolvedValue(undefined);

		const event = createMockSqsEvent({ receipt: 'mock-receipt-data' });

		await expect(handler(event)).rejects.toThrow(
			'[ae7b14ba] there was a problem while acquiring subscription data from Apple',
		);
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining(
				'[e88e8329] there was a problem while acquiring subscription data from Apple',
			),
		);
		expect(restClient.client.post).not.toHaveBeenCalled();
	});
});
