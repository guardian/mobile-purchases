import type { APIGatewayProxyEvent } from 'aws-lambda';
import { buildHandler } from '../../../src/feast/pubsub/google';
import { HTTPResponses } from '../../../src/models/apiGatewayHttp';
import { SubscriptionEvent } from '../../../src/models/subscriptionEvent';
import Mock = jest.Mock;
import type { GoogleSubscriptionReference } from '../../../src/models/subscriptionReference';

const buildApiGatewayEvent = (secret: string): APIGatewayProxyEvent => {
  const receivedEvent = {
    version: '1.0',
    packageName: 'uk.co.guardian.feast',
    eventTimeMillis: '1503349566168',
    subscriptionNotification: {
      version: '1.0',
      notificationType: 4,
      purchaseToken: 'PURCHASE_TOKEN',
      subscriptionId: 'uk.co.guardian.feast.access.test',
    },
  };

  const encodedEvent = Buffer.from(JSON.stringify(receivedEvent)).toString(
    'base64',
  );

  const body = {
    message: {
      data: encodedEvent,
      messageId: '123',
      message_id: '123',
      publishTime: '2019-05-24T15:06:47.701Z',
      publish_time: '2019-05-24T15:06:47.701Z',
    },
    subscription:
      'projects/guardian.co.uk/subscriptions/feast-in-app-subscription-test',
  };

  return {
    body: JSON.stringify(body),
    headers: {},
    multiValueHeaders: {},
    httpMethod: 'POST',
    isBase64Encoded: false,
    path: '',
    pathParameters: {},
    queryStringParameters: { secret: secret },
    multiValueQueryStringParameters: {},
    // @ts-expect-error
    requestContext: null,
    resource: '',
  };
};

beforeEach(() => {
  process.env['QueueUrl'] = '';
  process.env['Secret'] = 'test_secret';
});

describe('The Feast Google pubsub', () => {
  it('Should return HTTP 200 if secret is correct and input is valid', async () => {
    const correctSecret = 'test_secret';
    const input = buildApiGatewayEvent(correctSecret);

    const noOpStoreEventInDynamo = (event: SubscriptionEvent): Promise<void> =>
      Promise.resolve();
    const mockSqsFunction: Mock<
      Promise<any>,
      [string, GoogleSubscriptionReference]
    > = jest.fn((queueurl, event) => Promise.resolve({}));
    const mockFetchMetadataFunction: Mock<Promise<any>> = jest.fn((event) =>
      Promise.resolve({ freeTrial: true }),
    );
    const handler = buildHandler(
      mockSqsFunction,
      noOpStoreEventInDynamo,
      mockFetchMetadataFunction,
    );

    const result = await handler(input);

    expect(result).toStrictEqual(HTTPResponses.OK);
  });

  it('Should return HTTP 401 if secret is incorrect', async () => {
    const incorrectSecret = 'incorrect_secret';
    const input = buildApiGatewayEvent(incorrectSecret);

    const noOpStoreEventInDynamo = (event: SubscriptionEvent): Promise<void> =>
      Promise.resolve();
    const mockSqsFunction: Mock<
      Promise<any>,
      [string, GoogleSubscriptionReference]
    > = jest.fn((queueurl, event) => Promise.resolve({}));
    const mockFetchMetadataFunction: Mock<Promise<any>> = jest.fn((event) =>
      Promise.resolve({ freeTrial: true }),
    );
    const handler = buildHandler(
      mockSqsFunction,
      noOpStoreEventInDynamo,
      mockFetchMetadataFunction,
    );

    const result = await handler(input);

    expect(result).toStrictEqual(HTTPResponses.UNAUTHORISED);
  });

  it('invokes the method to add the event to the Dynamo table', async () => {
    const correctSecret = 'test_secret';
    const input = buildApiGatewayEvent(correctSecret);

    const mockSqsFunction: Mock<
      Promise<any>,
      [string, GoogleSubscriptionReference]
    > = jest.fn((queueurl, event) => Promise.resolve({}));
    const storeEventInDynamoMock = jest.fn(() => Promise.resolve());
    const mockFetchMetadataFunction: Mock<Promise<any>> = jest.fn((event) =>
      Promise.resolve({ freeTrial: true }),
    );
    const handler = buildHandler(
      mockSqsFunction,
      storeEventInDynamoMock,
      mockFetchMetadataFunction,
    );

    const result = await handler(input);
    const expectedSubscriptionEventInDynamo: SubscriptionEvent =
      new SubscriptionEvent(
        'PURCHASE_TOKEN',
        '2017-08-21T21:06:06.168Z|SUBSCRIPTION_PURCHASED',
        '2017-08-21',
        '2017-08-21T21:06:06.168Z',
        'SUBSCRIPTION_PURCHASED',
        'android-feast',
        'uk.co.guardian.feast',
        true,
        {
          eventTimeMillis: '1503349566168',
          packageName: 'uk.co.guardian.feast',
          subscriptionNotification: {
            notificationType: 4,
            purchaseToken: 'PURCHASE_TOKEN',
            subscriptionId: 'uk.co.guardian.feast.access.test',
            version: '1.0',
          },
          version: '1.0',
        },
        null,
        1582319167,
        null,
        null,
        undefined,
        undefined,
        undefined,
        '',
      );

    expect(result).toStrictEqual(HTTPResponses.OK);
    expect(storeEventInDynamoMock).toHaveBeenCalledTimes(1);
    expect(storeEventInDynamoMock).toHaveBeenCalledWith(
      expectedSubscriptionEventInDynamo,
    );
  });

  it('Should publish data to SQS queue', async () => {
    const correctSecret = 'test_secret';
    const input = buildApiGatewayEvent(correctSecret);
    const expectedSubscriptionReferenceInSqs = {
      packageName: 'uk.co.guardian.feast',
      purchaseToken: 'PURCHASE_TOKEN',
      subscriptionId: 'uk.co.guardian.feast.access.test',
    };

    const noOpStoreEventInDynamo = (event: SubscriptionEvent): Promise<void> =>
      Promise.resolve();
    const mockSqsFunction: Mock<
      Promise<any>,
      [string, GoogleSubscriptionReference]
    > = jest.fn((queueurl, event) => Promise.resolve({}));
    const mockFetchMetadataFunction: Mock<Promise<any>> = jest.fn((event) =>
      Promise.resolve({ freeTrial: true }),
    );
    const handler = buildHandler(
      mockSqsFunction,
      noOpStoreEventInDynamo,
      mockFetchMetadataFunction,
    );

    const result = await handler(input);

    expect(result).toStrictEqual(HTTPResponses.OK);
    expect(mockSqsFunction.mock.calls.length).toEqual(1);
    expect(mockSqsFunction.mock.calls[0][1]).toStrictEqual(
      expectedSubscriptionReferenceInSqs,
    );
  });
});
