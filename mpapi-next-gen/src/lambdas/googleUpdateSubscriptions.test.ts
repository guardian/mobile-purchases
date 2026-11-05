import 'source-map-support/register';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { putSubscription } from './googleUpdateSubscriptions';
import { Subscription } from '../common/subscription';

const dynamoDbMock = mockClient(DynamoDBClient);

describe('putSubscription DynamoDB Mapper', () => {
	beforeEach(() => {
		dynamoDbMock.reset();
	});

	it('should correctly map a Subscription class instance to a plain data object for marshalling', async () => {
		dynamoDbMock.on(PutItemCommand).resolves({});

		const mockSubscription = new Subscription(
			'Example-kokmikjooafaEUsuLAO3RKjfwtmyQ', // subscriptionId carries purchase token
			'2026-01-01T00:00:00.000Z', // startTimestamp
			'2026-02-01T00:00:00.000Z', // endTimestamp
			undefined, // cancellationTimestamp
			true, // autoRenewing
			'uk.co.guardian.feast.access', // productId
			'android', // platform
			false, // freeTrial
			'P1M', // billingPeriod
			{ expiryTimeMillis: '1767225600000' }, // googlePayload
			undefined, // receipt
			undefined, // applePayload
			1800000000, // ttl
			'{"some":"extra-metadata"}', // extra
		);

		await putSubscription(mockSubscription);

		const calledCommands = dynamoDbMock.commandCalls(PutItemCommand);
		expect(calledCommands.length).toBe(1);

		const inputItem = calledCommands[0].args[0].input.Item;
		expect(inputItem).toBeDefined();

		expect(inputItem?.subscriptionId?.S).toBe(
			'Example-kokmikjooafaEUsuLAO3RKjfwtmyQ',
		);
		expect(inputItem?.productId?.S).toBe('uk.co.guardian.feast.access');
		expect(inputItem?.autoRenewing?.BOOL).toBe(true);
		expect(inputItem?.ttl?.N).toBe('1800000000');

		expect(inputItem?.cancellationTimestamp).toBeUndefined();
		expect(inputItem?.applePayload).toBeUndefined();
	});
});
