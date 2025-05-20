import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { AWSError } from 'aws-sdk';
import type Sqs from 'aws-sdk/clients/sqs';
import type { PromiseResult } from 'aws-sdk/lib/request';
import { HTTPResponses } from '../../models/apiGatewayHttp';
import type { SubscriptionEvent } from '../../models/subscriptionEvent';
import type { GoogleSubscriptionReference } from '../../models/subscriptionReference';
import type {
    GoogleSubscriptionMetaData,
    SubscriptionNotification,
} from '../../pubsub/google-common';
import {
    fetchMetadata as defaultFetchMetadata,
    parsePayload,
    toDynamoEvent_google_async,
    toSqsSubReference,
} from '../../pubsub/google-common';
import { Ignorable } from '../../pubsub/ignorable';
import { dynamoMapper, sendToSqs } from '../../utils/aws';

const defaultStoreEventInDynamo = (event: SubscriptionEvent): Promise<void> => {
    return dynamoMapper.put({ item: event }).then((_) => undefined);
};

export function buildHandler(
    sendMessageToSqs: (
        queueUrl: string,
        message: GoogleSubscriptionReference,
    ) => Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> = sendToSqs,
    storeEventInDynamo: (event: SubscriptionEvent) => Promise<void> = defaultStoreEventInDynamo,
    fetchMetadata: (
        notification: SubscriptionNotification,
    ) => Promise<GoogleSubscriptionMetaData | undefined> = defaultFetchMetadata,
): (request: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> {
    return async (request: APIGatewayProxyEvent) => {
        const secret = process.env.Secret;

        if (secret === undefined) {
            console.error("PubSub secret in env is 'undefined'");
            return HTTPResponses.INTERNAL_ERROR;
        }

        if (request.queryStringParameters?.secret === secret) {
            const notification = parsePayload(request.body);
            if (notification instanceof Error) {
                console.log('Parsing the payload failed: ', notification.message);
                return HTTPResponses.INVALID_REQUEST;
            } else if (notification instanceof Ignorable) {
                console.log('Ignoring event: ', notification.message);
                return HTTPResponses.OK;
            }

            try {
                const androidSubscriptionReference = toSqsSubReference(notification);
                const queueUrl = process.env.QueueUrl;
                if (queueUrl === undefined) {
                    throw new Error('No QueueUrl env parameter provided');
                }

                const metaData = await fetchMetadata(notification);
                const dynamoEvent = await toDynamoEvent_google_async(notification, metaData);

                await Promise.all([
                    sendMessageToSqs(queueUrl, androidSubscriptionReference),
                    storeEventInDynamo(dynamoEvent),
                ]);
            } catch (e) {
                console.error('Internal server error', e);
                return HTTPResponses.INTERNAL_ERROR;
            }
            return HTTPResponses.OK;
        } else {
            return HTTPResponses.UNAUTHORISED;
        }
    };
}

export const handler = buildHandler();
