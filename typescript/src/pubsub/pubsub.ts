import 'source-map-support/register';
import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AWSError } from 'aws-sdk';
import type Sqs from 'aws-sdk/clients/sqs';
import type { PromiseResult } from 'aws-sdk/lib/request';
import { HTTPResponses } from '../models/apiGatewayHttp';
import type { SubscriptionEvent } from '../models/subscriptionEvent';
import { dynamoMapper, sendToSqs, sqs } from '../utils/aws';
import type { Option } from '../utils/option';
import { Ignorable } from './ignorable';

export const ONE_YEAR_IN_SECONDS = 31557600;

async function catchingServerErrors(
  block: () => Promise<APIGatewayProxyResult>,
): Promise<APIGatewayProxyResult> {
  try {
    return block();
  } catch (e) {
    console.error('Internal server error', e);
    return HTTPResponses.INTERNAL_ERROR;
  }
}

function storeInDynamoImpl(
  event: SubscriptionEvent,
): Promise<SubscriptionEvent> {
  return dynamoMapper.put({ item: event }).then((result) => result.item);
}

export async function parseStoreAndSend_async<Payload, SqsEvent, MetaData>(
  request: APIGatewayProxyEvent,
  parsePayload: (body: Option<string>) => Payload | Ignorable | Error,
  toDynamoEvent: (payload: Payload, metaData?: MetaData) => Promise<SubscriptionEvent>,
  toSqsEvent: (payload: Payload) => SqsEvent,
  fetchMetadata: (payload: Payload) => Promise<MetaData | undefined>,
  storeInDynamo: (
    event: SubscriptionEvent,
  ) => Promise<SubscriptionEvent> = storeInDynamoImpl,
  sendToSqsFunction: (
    queueUrl: string,
    event: SqsEvent,
  ) => Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> = sendToSqs,
): Promise<APIGatewayProxyResult> {
  const secret = process.env.Secret;
  return catchingServerErrors(async () => {
    if (secret === undefined) {
      console.error("PubSub secret in env is 'undefined'");
      return HTTPResponses.INTERNAL_ERROR;
    }
    if (request.queryStringParameters?.secret === secret) {
      const notification = parsePayload(request.body);
      console.log(`[e13c6557] ${JSON.stringify(notification)}`);
      if (notification instanceof Error) {
        console.log('Parsing the payload failed: ', notification.message);
        return HTTPResponses.INVALID_REQUEST;
      } else if (notification instanceof Ignorable) {
        console.log('Ignoring event: ', notification.message);
        return HTTPResponses.OK;
      }

      const queueUrl = process.env.QueueUrl;
      if (queueUrl === undefined) {
        throw new Error('No QueueUrl env parameter provided');
      }

      const metaData = await fetchMetadata(notification);
      const dynamoEvent = await toDynamoEvent(notification, metaData);
      const dynamoPromise = storeInDynamo(dynamoEvent);
      const sqsEvent = toSqsEvent(notification);
      const sqsPromise = sendToSqsFunction(queueUrl, sqsEvent);

      return Promise.all([sqsPromise, dynamoPromise])
        .then((value) => HTTPResponses.OK)
        .catch((error) => {
          console.error('Unable to process event' + notification, error);
          return HTTPResponses.INTERNAL_ERROR;
        });
    } else {
      return HTTPResponses.UNAUTHORISED;
    }
  });
}
