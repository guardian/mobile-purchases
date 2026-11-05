import { handler } from './promotionalOffersAppleFetchOfferDetails';
import { getParameterValueUsingAppStageStackConvention } from '../common/ssmParameters';
import * as crypto from 'crypto';
import type { APIGatewayProxyEvent } from 'aws-lambda';

jest.mock('../common/ssmParameters');
jest.mock('crypto', () => {
	const actualCrypto = jest.requireActual('crypto');
	return {
		...actualCrypto,
		randomUUID: jest.fn(() => 'mocked-uuid-nonce-111-222'),
	};
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
let consoleLogSpy: jest.SpyInstance;

describe('StoreKit Promotional Offer Signature Handler', () => {
	const mockPrivateKey = crypto
		.generateKeyPairSync('ec', {
			namedCurve: 'prime256v1',
		})
		.privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;

	beforeEach(() => {
		jest.clearAllMocks();
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
		jest.spyOn(Date, 'now').mockReturnValue(1730000000000);

		(
			getParameterValueUsingAppStageStackConvention as jest.Mock
		).mockImplementation((paramName: string) => {
			if (paramName === 'promotional-offers-appBundleId') {
				return Promise.resolve('uk.co.guardian.Feast');
			}
			if (paramName === 'promotional-offers-keyIdentifier') {
				return Promise.resolve('KEY_ID_ABC123');
			}
			if (paramName === 'promotional-offers-encryption-private-key') {
				return Promise.resolve(mockPrivateKey);
			}
			return Promise.resolve('');
		});
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	const createMockApiGatewayEvent = (
		body: object | null,
	): APIGatewayProxyEvent => ({
		body: body ? JSON.stringify(body) : null,
		headers: {},
		multiValueHeaders: {},
		httpMethod: 'POST',
		isBase64Encoded: false,
		path: '/offers',
		pathParameters: null,
		queryStringParameters: null,
		multiValueQueryStringParameters: null,
		stageVariables: null,
		requestContext: {} as any,
		resource: '',
	});

	it('should successfully read parameters from SSM, verify payload strings, and generate a structural StoreKit signature payload', async () => {
		const requestPayload = {
			username: 'TEST_USER_IDENTITY',
			productIdentifier: 'uk.co.guardian.Feast.monthly',
			offerIdentifier: 'PROMO_OFFER_2026',
		};

		const event = createMockApiGatewayEvent(requestPayload);

		const result = await handler(event);

		expect(result.statusCode).toBe(200);

		const body = JSON.parse(result.body);
		expect(body.nonce).toBe('mocked-uuid-nonce-111-222');
		expect(body.timestamp).toBe(1730000000000);
		expect(body.keyIdentifier).toBe('KEY_ID_ABC123');
		expect(body.signature).toBeDefined();
		expect(typeof body.signature).toBe('string');

		expect(getParameterValueUsingAppStageStackConvention).toHaveBeenCalledWith(
			'promotional-offers-appBundleId',
		);
		expect(getParameterValueUsingAppStageStackConvention).toHaveBeenCalledWith(
			'promotional-offers-keyIdentifier',
		);
		expect(getParameterValueUsingAppStageStackConvention).toHaveBeenCalledWith(
			'promotional-offers-encryption-private-key',
		);

		const signatureBuffer = Buffer.from(body.signature, 'base64');
		const separator = '\u2063';
		const expectedPayloadString =
			'uk.co.guardian.Feast' +
			separator +
			'KEY_ID_ABC123' +
			separator +
			'uk.co.guardian.Feast.monthly' +
			separator +
			'PROMO_OFFER_2026' +
			separator +
			'test_user_identity' +
			separator +
			'mocked-uuid-nonce-111-222' +
			separator +
			'1730000000000';

		const verify = crypto.createVerify('SHA256');
		verify.update(Buffer.from(expectedPayloadString, 'utf8'));

		const publicKey = crypto.createPublicKey({ key: mockPrivateKey });
		const isValid = verify.verify(publicKey, signatureBuffer);
		expect(isValid).toBe(true);
	});

	it('should cleanly wrap exceptions inside an HTTP 500 status block when parameter assembly errors trigger rejections', async () => {
		(
			getParameterValueUsingAppStageStackConvention as jest.Mock
		).mockRejectedValue(new Error('AWS SSM Parameter Store Unavailable'));

		const requestPayload = {
			username: 'error_user',
			productIdentifier: 'product_id',
			offerIdentifier: 'offer_id',
		};

		const event = createMockApiGatewayEvent(requestPayload);

		const result = await handler(event);

		expect(result.statusCode).toBe(500);
		expect(result.body).toBe('error while computing response');
		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining(
				'error while computing response: Error: AWS SSM Parameter Store Unavailable',
			),
		);
	});
});
