import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AWSError } from 'aws-sdk';
import type Sqs from 'aws-sdk/clients/sqs';
import type { PromiseResult } from 'aws-sdk/lib/request';
import { HTTPResponses } from '../../models/apiGatewayHttp';
import type { AppleSubscriptionReference } from '../../models/subscriptionReference';
import { toDynamoEvent, toSqsSubReference } from '../../pubsub/apple';
import type { StatusUpdateNotification } from '../../pubsub/apple-common';
import { parsePayload } from '../../pubsub/apple-common';
import { dynamoMapper, sendToSqs } from '../../utils/aws';

const defaultLogRequest = (request: APIGatewayProxyEvent): void =>
  console.log(`[34ef7aa3] ${JSON.stringify(request)}`);

const defaultStoreEventInDynamo = (
  event: StatusUpdateNotification,
): Promise<void> => {
  const item = toDynamoEvent(event, true);
  return dynamoMapper.put({ item }).then((_) => undefined);
};

export function buildHandler(
  sendMessageToSqs: (
    queueUrl: string,
    message: AppleSubscriptionReference,
  ) => Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> = sendToSqs,
  storeEventInDynamo: (
    event: StatusUpdateNotification,
  ) => Promise<void> = defaultStoreEventInDynamo,
  logRequest: (request: APIGatewayProxyEvent) => void = defaultLogRequest,
): (request: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
  return async (request: APIGatewayProxyEvent) => {
    const secret = process.env.Secret;

    if (secret === undefined) {
      console.error("PubSub secret in env is 'undefined'");
      return HTTPResponses.INTERNAL_ERROR;
    }

    if (request.queryStringParameters?.secret === secret) {
      logRequest(request);

      const statusUpdateNotification = parsePayload(request.body);
      if (statusUpdateNotification instanceof Error) {
        return HTTPResponses.INVALID_REQUEST;
      }

      const appleSubscriptionReference = toSqsSubReference(
        statusUpdateNotification,
      );

      try {
        const queueUrl = process.env.QueueUrl;
        if (queueUrl === undefined) {
          throw new Error('No QueueUrl env parameter provided');
        }

        await Promise.all([
          sendMessageToSqs(queueUrl, appleSubscriptionReference),
          storeEventInDynamo(statusUpdateNotification),
        ]);

        return HTTPResponses.OK;
      } catch (e) {
        console.error('Internal server error', e);
        return HTTPResponses.INTERNAL_ERROR;
      }
    } else {
      return HTTPResponses.UNAUTHORISED;
    }
  };
}

export const handler = buildHandler();
