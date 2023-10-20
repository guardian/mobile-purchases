import 'source-map-support/register'
import {HTTPResponses} from "../models/apiGatewayHttp";
import {SubscriptionEvent} from "../models/subscriptionEvent";
import Sqs from 'aws-sdk/clients/sqs';
import {AWSError} from "aws-sdk";
import {PromiseResult} from "aws-sdk/lib/request";
import {sqs, dynamoMapper, sendToSqs} from "../utils/aws";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";
import {Option} from "../utils/option";

export const ONE_YEAR_IN_SECONDS = 31557600;

async function catchingServerErrors(block: () => Promise<APIGatewayProxyResult>): Promise<APIGatewayProxyResult> {
    try {
        return block();
    } catch (e) {
        console.error("Internal server error", e);
        return HTTPResponses.INTERNAL_ERROR
    }
}

function storeInDynamoImpl(event: SubscriptionEvent): Promise<SubscriptionEvent> {
    console.log(`[246ff796] storeInDynamoImpl ${JSON.stringify(event)}`);
    return dynamoMapper.put({item: event}).then(result => result.item);
}

export async function parseStoreAndSend<Payload, SqsEvent, MetaData>(
    request: APIGatewayProxyEvent,
    parsePayload: (body: Option<string>) => Payload | Error,
    toDynamoEvent: (payload: Payload, metaData?: MetaData) => SubscriptionEvent,
    toSqsEvent: (payload: Payload) => SqsEvent,
    fetchMetadata: (payload: Payload) => Promise<MetaData | undefined>,
    storeInDynamo: (event: SubscriptionEvent) => Promise<SubscriptionEvent> = storeInDynamoImpl,
    sendToSqsFunction: (queueUrl: string, event: SqsEvent) => Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> = sendToSqs,
): Promise<APIGatewayProxyResult> {
    const secret = process.env.Secret;
    console.log(`[4ba45228] secret: ${secret}`);
    return catchingServerErrors(async () => {
        if (secret === undefined) {
            console.error("PubSub secret in env is 'undefined'");
            return HTTPResponses.INTERNAL_ERROR
        }
        console.log(`[4ba45228] request.queryStringParameters?.secret: ${request.queryStringParameters?.secret}`);
        if (request.queryStringParameters?.secret === secret) {
            const notification = parsePayload(request.body);
            if (notification instanceof Error) {
                return HTTPResponses.INVALID_REQUEST
            }
            
            const queueUrl = process.env.QueueUrl;
            if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");

            console.log("[586bc9c6] 07");
            const metaData = await fetchMetadata(notification);
            console.log("[586bc9c6] 08");
            const dynamoEvent = toDynamoEvent(notification, metaData);
            console.log("[586bc9c6] 09");
            const dynamoPromise = storeInDynamo(dynamoEvent);
            console.log("[586bc9c6] 10");
            const sqsEvent = toSqsEvent(notification);
            console.log("[586bc9c6] 11");
            const sqsPromise = sendToSqsFunction(queueUrl, sqsEvent);
            console.log("[586bc9c6] 12");

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



