import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { toSqsSubReference } from "../../pubsub/apple";
import { parsePayload } from "../../pubsub/apple-common";
import { AppleSubscriptionReference } from "../../models/subscriptionReference";
import Sqs from 'aws-sdk/clients/sqs';
import { sendToSqs } from "../../utils/aws";
import { AWSError } from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";
import { HTTPResponses } from "../../models/apiGatewayHttp";

export async function handler(request: APIGatewayProxyEvent): Promise<APIGatewayProxyResult>  {
    console.log(`[34ef7aa3] ${JSON.stringify(request)}`)
    const handler = buildHandler()
    return handler(request)
}

export function buildHandler(
    sendMessageToSqs: (queueUrl: string, message: AppleSubscriptionReference) => Promise<PromiseResult<Sqs.SendMessageResult, AWSError>> = sendToSqs
): (request: APIGatewayProxyEvent) => Promise<APIGatewayProxyResult> { 
    return async (request: APIGatewayProxyEvent) => {

        const statusUpdateNotification =
            parsePayload(request.body)
        if (statusUpdateNotification instanceof Error) {
            return HTTPResponses.INVALID_REQUEST
        }

        const appleSubscriptionReference = 
            toSqsSubReference(statusUpdateNotification)
        
        try {
            const queueUrl = process.env.QueueUrl;
            if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");

            await sendMessageToSqs(queueUrl, appleSubscriptionReference)

            return HTTPResponses.OK
        } catch (e) {
            console.error("Internal server error", e);
            return HTTPResponses.INTERNAL_ERROR
        }
    }
}
