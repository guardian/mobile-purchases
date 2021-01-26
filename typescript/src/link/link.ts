import {HTTPResponses} from '../models/apiGatewayHttp';

import {UserSubscription} from "../models/userSubscription";
import {ReadSubscription} from "../models/subscription";
import {dynamoMapper, sqs} from "../utils/aws";
import {getUserId, getAuthToken} from "../utils/guIdentityApi";
import {SubscriptionReference} from "../models/subscriptionReference";
import {SendMessageBatchRequestEntry} from "aws-sdk/clients/sqs";
import {ProcessingError} from "../models/processingError";
import {APIGatewayProxyEvent, APIGatewayProxyResult} from "aws-lambda";

export interface SubscriptionCheckData {
    subscriptionId: string
    subscriptionReference: SubscriptionReference
}

async function enqueueUnstoredPurchaseToken(subChecks: SubscriptionCheckData[]): Promise<number> {

    const dynamoResult = dynamoMapper.batchGet(subChecks.map(sub => new ReadSubscription().setSubscriptionId(sub.subscriptionId)));

    type IndexedSubscriptionCheckData = {[id: string]: SubscriptionCheckData};
    const indexedReferences: IndexedSubscriptionCheckData = subChecks.reduce((agg, value) => {
        agg[value.subscriptionId] = value;
        return agg
    }, {} as IndexedSubscriptionCheckData);

    // eliminate all known subscriptions
    for await (const result of dynamoResult) {
        delete indexedReferences[result.subscriptionId];
    }

    const refsToSend = Object.values(indexedReferences).map((value) => value.subscriptionReference);

    if (refsToSend.length > 0) {
        const queueUrl = process.env.QueueUrl;
        if (queueUrl === undefined) throw new Error("No QueueUrl env parameter provided");

        const sqsMessages: SendMessageBatchRequestEntry[] = refsToSend.map((subRef, index) => ({
            Id: index.toString(),
            MessageBody: JSON.stringify(subRef)
        }));

        const result = await sqs.sendMessageBatch({QueueUrl: queueUrl, Entries: sqsMessages}).promise();
        if (result.Failed && result.Failed.length > 0) {
            throw new ProcessingError("Unable to send all the subscription reference to SQS, will retry", true);
        }
        return result.Successful.length;
    } else {
        return 0;
    }

}

async function persistUserSubscriptionLinks(userSubscriptions: UserSubscription[]): Promise<number>  {
    let count = 0;
    for await (const r of dynamoMapper.batchPut(userSubscriptions)) {
        count++;
    }
    return count;
}

export async function parseAndStoreLink<A, B>(
    httpRequest: APIGatewayProxyEvent,
    parsePayload: (request: APIGatewayProxyEvent) => A,
    toUserSubscription: (userId: string, payload: A) => UserSubscription[],
    toSqsPayload: (payload: A) => SubscriptionCheckData[]
): Promise<APIGatewayProxyResult> {
    try {
        if (httpRequest.headers && getAuthToken(httpRequest.headers)) {
            const payload: A = parsePayload(httpRequest);
            const userId = await getUserId(httpRequest.headers);
            if (userId) {
                const insertCount = await persistUserSubscriptionLinks(toUserSubscription(userId, payload));
                const sqsCount = await enqueueUnstoredPurchaseToken(toSqsPayload(payload));
                console.log(`Put ${insertCount} links in the DB, and sent ${sqsCount} subscription refs to SQS`);

                return HTTPResponses.OK;
            } else {
                return HTTPResponses.UNAUTHORISED;
            }
        } else {
            return HTTPResponses.INVALID_REQUEST
        }
    } catch (error) {
        console.error("Internal Server Error", error);
        return HTTPResponses.INTERNAL_ERROR
    }
}
