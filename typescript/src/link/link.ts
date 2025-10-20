import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import type { SendMessageBatchRequestEntry } from 'aws-sdk/clients/sqs';
import { HTTPResponses } from '../models/apiGatewayHttp';
import { ProcessingError } from '../models/processingError';
import { SubscriptionEmpty } from '../models/subscription';
import type { SubscriptionReference } from '../models/subscriptionReference';
import type { UserSubscription } from '../models/userSubscription';
import { dynamoMapper, sqs } from '../utils/aws';
import { getAuthToken, getUserId } from '../utils/guIdentityApi';
import type { UserIdResolution } from '../utils/guIdentityApi';

export interface SubscriptionCheckData {
    subscriptionId: string;
    subscriptionReference: SubscriptionReference;
}

async function enqueueUnstoredPurchaseToken(subChecks: SubscriptionCheckData[]): Promise<number> {
    // There's nothing to do if there are no subs to check - this will always be
    // the case for Feast.
    if (subChecks.length === 0) {
        return 0;
    }

    const dynamoResult = dynamoMapper.batchGet(
        subChecks.map((sub) => new SubscriptionEmpty().setSubscriptionId(sub.subscriptionId)),
    );

    type IndexedSubscriptionCheckData = Record<string, SubscriptionCheckData>;
    const indexedReferences: IndexedSubscriptionCheckData =
        subChecks.reduce<IndexedSubscriptionCheckData>((agg, value) => {
            agg[value.subscriptionId] = value;
            return agg;
        }, {});

    // eliminate all known subscriptions
    for await (const result of dynamoResult) {
        delete indexedReferences[result.subscriptionId];
    }

    const refsToSend = Object.values(indexedReferences).map((value) => value.subscriptionReference);

    if (refsToSend.length > 0) {
        const queueUrl = process.env.QueueUrl;
        if (queueUrl === undefined) {
            throw new Error('No QueueUrl env parameter provided');
        }

        const sqsMessages: SendMessageBatchRequestEntry[] = refsToSend.map((subRef, index) => ({
            Id: index.toString(),
            MessageBody: JSON.stringify(subRef),
        }));

        const result = await sqs
            .sendMessageBatch({ QueueUrl: queueUrl, Entries: sqsMessages })
            .promise();
        if (result.Failed && result.Failed.length > 0) {
            throw new ProcessingError(
                'Unable to send all the subscription reference to SQS, will retry',
                true,
            );
        }
        return result.Successful.length;
    } else {
        return 0;
    }
}

async function persistUserSubscriptionLinks(
    userSubscriptions: UserSubscription[],
): Promise<number> {
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
    toSqsPayload: (payload: A) => SubscriptionCheckData[],
): Promise<APIGatewayProxyResult> {
    try {
        console.log(`Input to link lambda is ${httpRequest}`);
        if (httpRequest.headers && getAuthToken(httpRequest.headers)) {
            const payload: A = parsePayload(httpRequest);
            const resolution: UserIdResolution = await getUserId(httpRequest.headers);
            switch (resolution.status) {
                case 'incorrect-token': {
                    return HTTPResponses.UNAUTHORISED;
                }
                case 'incorrect-scope': {
                    return HTTPResponses.FORBIDDEN;
                }
                case 'missing-identity-id': {
                    return HTTPResponses.INVALID_REQUEST;
                }
                case 'success': {
                    const userId = resolution.userId as string;
                    const insertCount = await persistUserSubscriptionLinks(
                        toUserSubscription(userId, payload),
                    );
                    const sqsCount = await enqueueUnstoredPurchaseToken(toSqsPayload(payload));
                    console.log(
                        `put ${insertCount} links in the DB, and sent ${sqsCount} subscription refs to SQS`,
                    );
                    return HTTPResponses.OK;
                }
            }
        } else {
            return HTTPResponses.INVALID_REQUEST;
        }
    } catch (error) {
        console.error('Internal Server Error', error);
        const message = (error as Error).message;
        if (
            typeof message === 'string' &&
            message.includes('Provided list of item keys contains duplicates')
        ) {
            console.error('Request body: ' + (httpRequest.body ?? ''));
        }
        return HTTPResponses.INTERNAL_ERROR;
    }
}
