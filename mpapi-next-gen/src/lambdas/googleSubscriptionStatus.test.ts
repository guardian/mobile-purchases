import 'source-map-support/register';
import { handler } from './googleSubscriptionStatus'; // Adjust path as necessary
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import type { APIGatewayProxyEvent } from 'aws-lambda';
import { fetchGoogleSubscription } from '../common/google-play';
import { optionalMsToDate } from '../common/dates';

// -----------------------------------------------------------------------------
// Mock upstream dependencies

jest.mock('../common/google-play', () => ({
	fetchGoogleSubscription: jest.fn(),
}));

jest.mock('../common/dates', () => ({
	optionalMsToDate: jest.fn(),
}));

jest.mock('../common/appIdentity', () => ({
	Region: 'eu-west-1',
	Stage: 'CODE',
}));

// -----------------------------------------------------------------------------
// Globals

const dynamoMock = mockClient(DynamoDBClient);

// -----------------------------------------------------------------------------
// Tests

describe('Google Subscription Status Lambda Handler', () => {
	const mockFetchGoogleSubscription = fetchGoogleSubscription as jest.Mock;
	const mockOptionalMsToDate = optionalMsToDate as jest.Mock;

	const fixedDate = new Date('2026-06-01T12:00:00.000Z');

	beforeEach(() => {
		dynamoMock.reset();
		jest.clearAllMocks();
		jest.useFakeTimers().setSystemTime(fixedDate);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	const createMockEvent = (
		headers: Record<string, string> = {
			'Play-Purchase-Token': 'mock-token-abc',
		},
		pathParameters: Record<string, string> | null = {
			subscriptionId: 'sub-id-123',
		},
	): APIGatewayProxyEvent => ({
		headers,
		pathParameters,
		body: null,
		httpMethod: 'GET',
		isBase64Encoded: false,
		path: '/subscription',
		queryStringParameters: null,
		multiValueHeaders: {},
		multiValueQueryStringParameters: null,
		stageVariables: null,
		requestContext: {} as any,
		resource: '',
	});

	it('should successfully unmarshall raw DynamoDB data and return an active status without calling Google', async () => {
		const rawDynamoItem = {
			subscriptionId: { S: 'mock-token-abc' },
			endTimestamp: { S: '2026-12-31T23:59:59.000Z' },
		};

		dynamoMock.on(GetItemCommand).resolves({
			Item: rawDynamoItem,
		});

		const event = createMockEvent();
		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		expect(JSON.parse(result.body)).toEqual({
			subscriptionHasLapsed: false,
			subscriptionExpiryDate: '2026-12-31T23:59:59.000Z',
		});

		const firstDynamoCall = dynamoMock.call(0);
		expect(firstDynamoCall.args[0].input).toEqual({
			TableName: 'mobile-purchases-CODE-subscriptions',
			Key: { subscriptionId: { S: 'mock-token-abc' } },
		});

		expect(mockFetchGoogleSubscription).not.toHaveBeenCalled();
	});

	it('should correctly flag a subscription as lapsed if Dynamo unmarshalls an older endTimestamp', async () => {
		const rawDynamoItem = {
			subscriptionId: { S: 'mock-token-abc' },
			endTimestamp: { S: '2026-01-01T00:00:00.000Z' },
		};

		dynamoMock.on(GetItemCommand).resolves({
			Item: rawDynamoItem,
		});

		const result = await handler(createMockEvent());

		expect(result.statusCode).toBe(200);
		expect(JSON.parse(result.body)).toEqual({
			subscriptionHasLapsed: true,
			subscriptionExpiryDate: '2026-01-01T00:00:00.000Z',
		});
	});

	it('should fall back to Google Play API if Dynamo returns no record', async () => {
		dynamoMock.on(GetItemCommand).resolves({
			Item: undefined,
		});

		mockFetchGoogleSubscription.mockResolvedValue({
			expiryTimeMillis: '1798761600000',
		});
		mockOptionalMsToDate.mockReturnValue(new Date('2026-12-31T00:00:00.000Z'));

		const event = createMockEvent({
			'package-name': 'com.guardian.feast',
			'play-purchase-token': 'mock-token-abc',
		});
		const result = await handler(event);

		expect(result.statusCode).toBe(200);
		expect(JSON.parse(result.body)).toEqual({
			subscriptionHasLapsed: false,
			subscriptionExpiryDate: '2026-12-31T00:00:00.000Z',
		});

		expect(mockFetchGoogleSubscription).toHaveBeenCalledWith(
			'sub-id-123',
			'mock-token-abc',
			'com.guardian.feast',
		);
	});

	it('should fall back to Google Play API if Dynamo lookup completely errors out', async () => {
		dynamoMock
			.on(GetItemCommand)
			.rejects(new Error('Dynamo Connection Failure'));

		mockFetchGoogleSubscription.mockResolvedValue({
			expiryTimeMillis: '1798761600000',
		});
		mockOptionalMsToDate.mockReturnValue(new Date('2026-12-31T00:00:00.000Z'));

		const result = await handler(createMockEvent());

		expect(result.statusCode).toBe(200);
		expect(mockFetchGoogleSubscription).toHaveBeenCalled();
	});

	it('should return a 404 NOT_FOUND if both Dynamo and Google have no records matching the token', async () => {
		dynamoMock.on(GetItemCommand).resolves({ Item: undefined });
		mockFetchGoogleSubscription.mockResolvedValue(null);
		mockOptionalMsToDate.mockReturnValue(null);

		const result = await handler(createMockEvent());
		expect(result.statusCode).toBe(404);
	});

	it('should handle a 410 Gone error from upstream Google API gracefully and convert it to a 404', async () => {
		dynamoMock.on(GetItemCommand).resolves({ Item: undefined });

		const upstreamError: any = new Error('The registration token has expired');
		upstreamError.statusCode = 410;
		mockFetchGoogleSubscription.mockRejectedValue(upstreamError);

		const result = await handler(createMockEvent());
		expect(result.statusCode).toBe(404);
	});

	it('should return a 500 INTERNAL_ERROR for any other unhandled tracking exception types from Google', async () => {
		dynamoMock.on(GetItemCommand).resolves({ Item: undefined });
		mockFetchGoogleSubscription.mockRejectedValue(new Error('Fatal API crash'));

		const result = await handler(createMockEvent());
		expect(result.statusCode).toBe(500);
	});

	it('should validate and return a 400 BAD_REQUEST if pathParameters or tokens are entirely missing', async () => {
		const badEvent = createMockEvent({}, null);
		const result = await handler(badEvent);
		expect(result.statusCode).toBe(400);
	});
});
