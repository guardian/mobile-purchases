import 'source-map-support/register'
import {HTTPRequest, HTTPResponse, HTTPResponses} from "../models/apiGatewayHttp";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import Sqs from 'aws-sdk/clients/sqs';
import {AWSError} from "aws-sdk";
import {PromiseResult} from "aws-sdk/lib/request";
import {sqs, dynamoMapper, sendToSqsImpl} from "../utils/aws";

export const ONE_YEAR_IN_SECONDS = 31557600;

async function catchingServerErrors(block: () => Promise<HTTPResponse>): Promise<HTTPResponse> {
    try {
        return block();
    } catch (e) {
        console.error("Internal server error", e);
        return HTTPResponses.INTERNAL_ERROR
    }
}

function storeInDynamoImpl(event: SubscriptionEvent): Promise<SubscriptionEvent> {
    return dynamoMapper.put({item: event}).then(result => result.item);
}

export async function parseStoreAndSend<Payload, SqsEvent>(
    request: HTTPRequest,
    parsePayload: (body?: string) => Payload | Error,
    toDynamoEvent: (payload: Payload) => SubscriptionEvent,
    toSqsEvent: (payload: Payload) => SqsEvent,
    storeInDynamo: (event: SubscriptionEvent) => Promise<SubscriptionEvent> = storeInDynamoImpl,
    sendToSqs: (queueUrl: string, event: SqsEvent) => Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> = sendToSqsImpl,
): Promise<HTTPResponse> {
    const secret = process.env.Secret;
    return catchingServerErrors(async () => {
        if (request.queryStringParameters && request.queryStringParameters.secret === secret) {
            const notification = parsePayload(request.body);
            if (notification instanceof Error) {
                return HTTPResponses.INVALID_REQUEST
            }
            const queueUrl = process.env.QueueUrl;
            if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");

            const dynamoEvent = toDynamoEvent(notification);
            const dynamoPromise = storeInDynamo(dynamoEvent);

            const sqsEvent = toSqsEvent(notification);
            const sqsPromise = sendToSqs(queueUrl, sqsEvent);

            return Promise.all([sqsPromise, dynamoPromise])
                .then(value => HTTPResponses.OK)
                .catch(error => {
                    console.error("Unable to process event" + notification, error);
                    return HTTPResponses.INTERNAL_ERROR
                });

        } else {
            return HTTPResponses.UNAUTHORISED
        }
    });
}



