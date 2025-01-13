import type { APIGatewayProxyEvent } from 'aws-lambda';
import { SubscriptionEmpty } from '../../src/models/subscription';
import { handler } from '../../src/user/user';
import { plusDays } from '../../src/utils/dates';

const TEST_SECRET = 'test_secret';
jest.mock('../../src/utils/ssmConfig', () => {
  return {
    getConfigValue: () => Promise.resolve(TEST_SECRET),
  };
});

jest.mock('@aws/dynamodb-data-mapper', () => {
  const actualDataMapper = jest.requireActual('@aws/dynamodb-data-mapper');

  const queryFn = jest.fn();
  const batchGetFn = jest.fn();

  return {
    ...actualDataMapper,
    DataMapper: jest.fn().mockImplementation(() => ({
      query: queryFn,
      batchGet: batchGetFn,
    })),
    setMockQuery: (mockImplementation: (arg0: any) => any) => {
      queryFn.mockImplementation(async function* (params) {
        const iterator = mockImplementation(params);
        for await (const item of iterator) {
          yield item;
        }
      });
    },
    setMockBatchGet: (mockImplementation: (arg0: any) => any) => {
      batchGetFn.mockImplementation(async function* (params) {
        const iterator = mockImplementation(params);
        for await (const item of iterator) {
          yield item;
        }
      });
    },
  };
});
const setMockQuery = require('@aws/dynamodb-data-mapper').setMockQuery;
const setMockBatchGet = require('@aws/dynamodb-data-mapper').setMockBatchGet;

describe('The user subscriptions lambda', () => {
  it('returns the correct subscriptions for a user', async () => {
    const mockDataMapper =
      new (require('@aws/dynamodb-data-mapper').DataMapper)();
    const userId = '123';
    const subscriptionId = '1';
    setMockQuery(async function* () {
      yield {
        userId,
        subscriptionId,
      };
    });
    const sub = new SubscriptionEmpty();
    sub.subscriptionId = subscriptionId;
    sub.platform = 'ios-feast';
    sub.productId = 'product-id';
    sub.startTimestamp = new Date().toISOString();
    sub.endTimestamp = plusDays(new Date(), 35).toISOString();
    setMockBatchGet(async function* () {
      yield sub;
    });
    const event = buildApiGatewayEvent(userId);

    const response = await handler(event);

    expect(response.statusCode).toEqual(200);
    expect(mockDataMapper.query).toHaveBeenCalledTimes(1);
    expect(mockDataMapper.batchGet).toHaveBeenCalledTimes(1);
    const data = JSON.parse(response.body);
    expect(data.subscriptions.length).toEqual(1);
    expect(data.subscriptions[0].subscriptionId).toEqual(subscriptionId);
    expect(data.subscriptions[0].valid).toEqual(true);
    expect(data.subscriptions[0].softOptInProductName).toEqual(
      'FeastInAppPurchase',
    );
  });
});

const buildApiGatewayEvent = (userId: string): APIGatewayProxyEvent => {
  return {
    headers: {
      Authorization: `Bearer ${TEST_SECRET}`,
    },
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '',
    pathParameters: { userId },
    queryStringParameters: {},
    multiValueQueryStringParameters: {},
    // @ts-expect-error
    requestContext: null,
    resource: '',
  };
};
