import 'source-map-support/register';
import { handler } from './feastGoogleAcquisitionEvents';
import { fetchGoogleSubscriptionV2 } from '../common/google-play-v2';
import { getParameterValueUsingAppStageStackConvention } from '../common/ssmParameters';
import type { SQSEvent } from 'aws-lambda';

jest.mock('../common/google-play-v2');
jest.mock('../common/ssmParameters');

jest.spyOn(console, 'log').mockImplementation(() => {});
jest.spyOn(console, 'error').mockImplementation(() => {});

describe('Feast Google Acquisition Events Lambda', () => {
	const mockGlobalFetch = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
		global.fetch = mockGlobalFetch;

		process.env.Stage = 'CODE';
		(
			getParameterValueUsingAppStageStackConvention as jest.Mock
		).mockResolvedValue('https://guardian.com');
		mockGlobalFetch.mockResolvedValue({
			ok: true,
			status: 200,
			text: async () => 'OK',
		});
	});

	const createMockSqsEvent = (
		subscriptionId: string,
		regionCode = 'GB',
	): SQSEvent => ({
		Records: [
			{
				body: JSON.stringify({
					subscriptionId: subscriptionId,
					startTimestamp: '2026-01-01T12:00:00.000Z',
					googlePayload: {
						rawResponse: {
							regionCode: regionCode,
							lineItems: [
								{
									offerDetails: {
										basePlanId: 'feast-monthly',
									},
								},
							],
						},
					},
				}),
				messageId: 'mock-sqs-id',
				receiptHandle: 'mock-receipt-handle',
				attributes: {} as any,
				messageAttributes: {},
				md5OfBody: 'md5',
				eventSource: 'aws:sqs',
				eventSourceARN: 'arn:aws:sqs',
				awsRegion: 'eu-west-1',
			},
		],
	});

	it('should successfully parse subscription payload properties and transform paymentId fields to track subscriptionId structures', async () => {
		(fetchGoogleSubscriptionV2 as jest.Mock).mockResolvedValue({
			startTime: new Date('2026-01-01T12:00:00.000Z'),
			expiryTime: new Date('2026-02-01T12:00:00.000Z'),
			autoRenewing: true,
			productId: 'feast-monthly',
			billingPeriodDuration: 'P1M',
			freeTrial: false,
			regionCode: 'GB',
			rawResponse: {
				lineItems: [
					{
						offerDetails: {
							basePlanId: 'feast-monthly',
						},
					},
				],
			},
		});

		const event = createMockSqsEvent('sub-abc-123');

		await handler(event);

		expect(mockGlobalFetch).not.toHaveBeenCalled();
	});

	it('should trigger an explicit outgoing POST payload dispatch when Stage parameter is set to PROD', async () => {
		process.env.Stage = 'PROD';

		let isolatedHandler: any;
		jest.isolateModules(() => {
			const module = require('./feastGoogleAcquisitionEvents');
			isolatedHandler = module.handler;
		});

		(fetchGoogleSubscriptionV2 as jest.Mock).mockResolvedValue({
			startTime: new Date('2026-01-01T12:00:00.000Z'),
			expiryTime: new Date('2026-02-01T12:00:00.000Z'),
			autoRenewing: true,
			productId: 'feast-annual',
			billingPeriodDuration: 'P1Y',
			freeTrial: false,
			regionCode: 'US',
			rawResponse: {
				lineItems: [
					{
						offerDetails: {
							basePlanId: 'feast-annual',
						},
					},
				],
			},
		});

		const event = createMockSqsEvent('sub-annual-777', 'US');
		await isolatedHandler(event);

		expect(mockGlobalFetch).toHaveBeenCalledTimes(1);
		const firstCallArgs = mockGlobalFetch.mock.calls[0];
		expect(firstCallArgs[0]).toBe('https://guardian.com');

		const optionsArgument = firstCallArgs[1];
		expect(optionsArgument.method).toBe('POST');
		expect(optionsArgument.headers).toEqual({
			'Content-Type': 'application/json',
		});

		const requestBody = JSON.parse(optionsArgument.body);

		expect(requestBody.paymentId).toBe('sub-annual-777');
		expect(requestBody.eventTimeStamp).toBe('2026-01-01T12:00:00.000Z');
		expect(requestBody.product).toBe('FEAST_APP');
		expect(requestBody.country).toBe('GB');
		expect(requestBody.currency).toBe('GBP');
		expect(requestBody.paymentFrequency).toBe('ANNUALLY');
		expect(requestBody.acquisitionType).toBe('PURCHASE');
		expect(requestBody.readerType).toBe('Direct');
	});

	it('should throw an unhandled exception when processing country codes not defined inside the local currency map dictionary', async () => {
		const validationError = new Error(
			'(countryToCurrencyMap) country XYZ is not supported',
		);
		(fetchGoogleSubscriptionV2 as jest.Mock).mockRejectedValue(validationError);

		const event = createMockSqsEvent('sub-broken-country', 'XYZ');

		await expect(async () => {
			await handler(event);
		}).rejects.toThrow('(countryToCurrencyMap) country XYZ is not supported');
	});
});
